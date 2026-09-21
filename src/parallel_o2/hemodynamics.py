"""Passive mean-pressure circuit with frozen calibration and two explicit closures."""

import hashlib
import json
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
from numpy.typing import ArrayLike, NDArray

from .inputs import InputError, parse_request
from .serialization import dumps

FLOW_MODEL_VERSION = "resistance-parallel-steady-v1"


@dataclass(frozen=True)
class FrozenCircuitReference:
    rs_mmhg_min_l: float
    rp_mmhg_min_l: float | NDArray[np.float64]
    rshunt_nominal_mmhg_min_l: float | NDArray[np.float64]
    qt_l_min: float
    common_downstream_pressure_mmhg: float
    calibration_qp_l_min: float
    qs_l_min: float
    nominal_afterload_mmhg_min_l: float
    driving_pressure_mmhg: float
    nonlinear_fraction: float
    k1_mmhg_min_l: float | NDArray[np.float64]
    k2_mmhg_min2_l2: float | NDArray[np.float64]

    @property
    def sha256(self) -> str:
        return hashlib.sha256(dumps(asdict(self)).encode()).hexdigest()


def validated_resistance(request: dict[str, Any]) -> dict[str, Any]:
    try:
        obj = parse_request(json.dumps(request, allow_nan=False))
    except (ValueError, TypeError, RecursionError) as exc:
        raise InputError("Expected finite, serializable resistance inputs") from exc
    if obj["schema_version"] != "resistance-experiment-v1":
        raise InputError("Expected resistance-experiment-v1")
    return obj


def harmonic(a: ArrayLike, b: ArrayLike) -> NDArray[np.float64]:
    x, y = np.broadcast_arrays(np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64))
    with np.errstate(all="ignore"):
        return np.asarray(np.minimum(x, y) / (1 + np.minimum(x, y) / np.maximum(x, y)))


def resolve_resistance_reference(request: dict[str, Any]) -> FrozenCircuitReference:
    request = validated_resistance(request)
    b = request["reference"]
    rs, rp, sh, qt = (
        np.float64(b[key])
        for key in ("rs_mmhg_min_l", "rp_mmhg_min_l", "rshunt_nominal_mmhg_min_l", "qt_l_min")
    )
    f = request["response"]["nonlinear_fraction"]
    with np.errstate(all="ignore"):
        load = float(harmonic(rs, rp + sh))
        scale = max(rs, rp + sh)
        pulmonary_fraction = (rs / scale) / (rs / scale + (rp + sh) / scale)
        systemic_fraction = ((rp + sh) / scale) / (rs / scale + (rp + sh) / scale)
        qp, qs = qt * pulmonary_fraction, qt * systemic_fraction
        pressure = qt * load
        k1, k2 = (1 - f) * sh, f * sh / qp
    return FrozenCircuitReference(
        float(rs),
        float(rp),
        float(sh),
        float(qt),
        float(b["common_downstream_pressure_mmhg"]),
        float(qp),
        float(qs),
        load,
        float(pressure),
        float(f),
        float(k1),
        float(k2),
    )


def _positive_root(a: ArrayLike, b: ArrayLike, c: ArrayLike) -> NDArray[np.float64]:
    """Positive root of a*x²+b*x-c=0 using scaled, nonnegative coefficients."""
    aa, bb, cc = np.broadcast_arrays(*(np.asarray(v, dtype=np.float64) for v in (a, b, c)))
    with np.errstate(all="ignore"):
        scale = np.maximum.reduce([aa, bb, cc])
        aa, bb, cc = aa / scale, bb / scale, cc / scale
        return np.asarray(2 * cc / (bb + np.sqrt(bb * bb + 4 * aa * cc)))


def _at_total(
    qt: ArrayLike, rs: ArrayLike, rp: ArrayLike, k1: ArrayLike, k2: ArrayLike
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
    total, resistance, native, linear, quadratic = np.broadcast_arrays(
        *(np.asarray(v, dtype=np.float64) for v in (qt, rs, rp, k1, k2))
    )
    with np.errstate(all="ignore"):
        # Solve for the fraction Qp/Qt. Scale the resistances before addition.
        scale = np.maximum.reduce([resistance, native, linear, quadratic * total])
        fraction = _positive_root(
            (quadratic / scale) * total,
            resistance / scale + native / scale + linear / scale,
            resistance / scale,
        )
        qp = total * fraction
        pressure = qp * (native + linear + quadratic * qp)
        qs = pressure / resistance  # avoids subtracting nearly equal Qt and Qp
    return qp, qs, pressure


def _at_pressure(
    pressure: ArrayLike, rs: ArrayLike, rp: ArrayLike, k1: ArrayLike, k2: ArrayLike
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
    dp, resistance, native, linear, quadratic = np.broadcast_arrays(
        *(np.asarray(v, dtype=np.float64) for v in (pressure, rs, rp, k1, k2))
    )
    with np.errstate(all="ignore"):
        qp = _positive_root(quadratic, native + linear, dp)
        qs = dp / resistance
    return qp, qs, dp


@dataclass
class HemodynamicArrays:
    metrics: dict[str, NDArray[np.float64]]
    residuals: dict[str, NDArray[np.float64]]
    status: NDArray[np.str_]
    iterations: int


def hemodynamics_arrays(
    reference: FrozenCircuitReference,
    rs_multiplier: ArrayLike,
    rp_multiplier: ArrayLike,
    rshunt_multiplier: ArrayLike,
    alpha: ArrayLike,
    nonlinear_fraction: ArrayLike,
    closure: str,
    scope: str = "native_rp",
) -> HemodynamicArrays:
    """Vectorized kernel for states, parameter grids and paired ensembles.

    Reference Qp calibration is independent of alpha/f; varying f is a declared structural
    comparison anchored at the same reference flow. No achieved-state recalibration occurs.
    """
    if closure not in ("nominal_parallel", "circuit_secant"):
        raise InputError("Unknown output closure")
    if scope not in ("native_rp", "whole_pathway_audit"):
        raise InputError("Unknown perturbation scope")
    ms, mp, mh, power, fraction = np.broadcast_arrays(
        *(
            np.asarray(v, dtype=np.float64)
            for v in (rs_multiplier, rp_multiplier, rshunt_multiplier, alpha, nonlinear_fraction)
        )
    )
    if scope == "whole_pathway_audit" and (
        np.any(power != 0) or np.any(fraction != 0) or np.any(mh != 1)
    ):
        raise InputError("Whole-pathway audit requires fixed output, linear shunt and mh=1")
    r = reference
    iterations = 0
    with np.errstate(all="ignore"):
        rs, rp = r.rs_mmhg_min_l * ms, r.rp_mmhg_min_l * mp
        sh = r.rshunt_nominal_mmhg_min_l * mh * (mp if scope == "whole_pathway_audit" else 1)
        k1, k2 = (1 - fraction) * sh, fraction * sh / r.calibration_qp_l_min
        nominal = harmonic(rs, rp + sh)
        invalid = (
            (ms <= 0)
            | (mp < 0)
            | (mh < 0)
            | (power < 0)
            | (power > 1)
            | (fraction < 0)
            | (fraction > 1)
            | ((rp + sh) <= 0)
        )
        desired = r.qt_l_min * np.exp(
            power * (np.log(r.nominal_afterload_mmhg_min_l) - np.log(nominal))
        )
        qp, qs, pressure = _at_total(desired, rs, rp, k1, k2)
        converged = np.ones(ms.shape, dtype=bool)
        if closure == "circuit_secant":
            # Monotone log-pressure residual gives one positive root; no Newton steps.
            center = np.full(ms.shape, np.log(r.driving_pressure_mmhg))

            def residual(log_pressure: NDArray[np.float64]) -> NDArray[np.float64]:
                pflow, sflow, _ = _at_pressure(np.exp(log_pressure), rs, rp, k1, k2)
                return np.asarray(
                    (1 - power) * (np.log(pflow + sflow) - np.log(r.qt_l_min))
                    + power * (log_pressure - np.log(r.driving_pressure_mmhg))
                )

            width = np.ones(ms.shape)
            lo, hi = np.maximum(-700.0, center - width), np.minimum(700.0, center + width)
            flo, fhi = residual(lo), residual(hi)
            for _ in range(11):
                bracketed = (flo <= 0) & (fhi >= 0)
                if np.all(bracketed | invalid):
                    break
                width = np.where(bracketed, width, width * 2)
                lo, hi = np.maximum(-700.0, center - width), np.minimum(700.0, center + width)
                flo, fhi = residual(lo), residual(hi)
            converged = (flo <= 0) & (fhi >= 0)
            for _ in range(64):
                mid = (lo + hi) / 2
                fm = residual(mid)
                hi = np.where(fm > 0, mid, hi)
                lo = np.where(fm <= 0, mid, lo)
            iterations = 64
            qp, qs, pressure = _at_pressure(np.exp((lo + hi) / 2), rs, rp, k1, k2)
            # Exact limit branches avoid iterative drift and retain their interpretation.
            qp0, qs0, dp0 = _at_total(np.full(ms.shape, r.qt_l_min), rs, rp, k1, k2)
            qp1, qs1, dp1 = _at_pressure(np.full(ms.shape, r.driving_pressure_mmhg), rs, rp, k1, k2)
            qp, qs, pressure = (
                np.where(power == 0, zero, np.where(power == 1, one, solved))
                for zero, one, solved in zip(
                    (qp0, qs0, dp0), (qp1, qs1, dp1), (qp, qs, pressure), strict=True
                )
            )
        qt = qp + qs
        sh_secant, sh_incremental = k1 + k2 * qp, k1 + 2 * k2 * qp
        native_drop, shunt_drop = rp * qp, sh_secant * qp
        branch = rs * qs - native_drop - shunt_drop
        flow_residual = (
            qt - desired
            if closure == "nominal_parallel"
            else (qt - r.qt_l_min if np.all(power == 0) else np.zeros_like(qt))
        )
        law = (
            np.log(qt / r.qt_l_min) - power * np.log(r.nominal_afterload_mmhg_min_l / nominal)
            if closure == "nominal_parallel"
            else (1 - power) * np.log(qt / r.qt_l_min)
            + power * np.log(pressure / r.driving_pressure_mmhg)
        )
        metrics = dict(
            qp_l_min=qp,
            qs_l_min=qs,
            qt_l_min=qt,
            r=qp / qs,
            driving_pressure_mmhg=pressure,
            arterial_pressure_mmhg=pressure + r.common_downstream_pressure_mmhg,
            common_downstream_pressure_mmhg=np.full(qt.shape, r.common_downstream_pressure_mmhg),
            rs_mmhg_min_l=rs,
            rp_mmhg_min_l=rp,
            rshunt_nominal_mmhg_min_l=sh,
            k1_mmhg_min_l=k1,
            k2_mmhg_min2_l2=k2,
            calibration_qp_l_min=np.full(qt.shape, r.calibration_qp_l_min),
            nominal_afterload_mmhg_min_l=nominal,
            circuit_secant_afterload_mmhg_min_l=pressure / qt,
            incremental_afterload_mmhg_min_l=harmonic(rs, rp + sh_incremental),
            shunt_secant_resistance_mmhg_min_l=sh_secant,
            shunt_incremental_resistance_mmhg_min_l=sh_incremental,
            native_pulmonary_pressure_drop_mmhg=native_drop,
            shunt_pressure_drop_mmhg=shunt_drop,
            systemic_pressure_drop_mmhg=rs * qs,
            nominal_native_fraction=rp / (rp + sh),
            operating_native_fraction=rp / (rp + sh_secant),
        )
        residuals = dict(
            flow_sum_l_min=flow_residual, branch_pressure_mmhg=branch, log_output_law=law
        )
        numerical = ~converged | (qp <= 0) | (qs <= 0) | (pressure <= 0)
        for val in [*metrics.values(), *residuals.values()]:
            numerical |= ~np.isfinite(val)
        numerical |= (
            (abs(branch) > 1e-10 * np.maximum(1, abs(pressure)))
            | (abs(flow_residual) > 1e-10 * np.maximum(1, qt))
            | (abs(law) > 1e-10)
        )
        status = np.where(
            invalid,
            "invalid_hemodynamic_domain",
            np.where(numerical, "hemodynamic_numerical_failure", "solved"),
        )
    return HemodynamicArrays(metrics, residuals, status, iterations)
