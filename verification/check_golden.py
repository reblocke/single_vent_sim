#!/usr/bin/env python3
"""Check specification fixtures using exact rational mass-balance elimination.

This is an independent reference verifier, not the production application.
It deliberately starts from mixed return and total extraction, rather than
copying the proposed production sequence of pulmonary-then-systemic drops.
Requires only Python's standard library. Run from any working directory.
"""
from __future__ import annotations

from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
import hashlib
import json
import math
import random
import sys

HERE = Path(__file__).resolve().parent
F = Fraction


def number(value: object) -> Fraction:
    if not isinstance(value, (float, int, str)):
        raise TypeError(f"Unsupported numeric value: {value!r}")
    return F(str(value))


def resolve(s: dict) -> tuple[Fraction, Fraction, Fraction, Fraction, Fraction]:
    flow, capacity = s['flow'], s['capacity']
    if flow['mode'] == 'total_ratio':
        qt, r = number(flow['qt_ml_kg_min']), number(flow['r'])
        qs, qp = qt/(1+r), qt*r/(1+r)
    elif flow['mode'] == 'independent_flows':
        qp, qs = number(flow['qp_ml_kg_min']), number(flow['qs_ml_kg_min'])
    else:
        raise ValueError('Unknown flow mode')
    if capacity['mode'] == 'direct_capacity':
        b = number(capacity['capacity_ml_dl'])
    elif capacity['mode'] == 'hb_linear':
        b = number(capacity['hb_g_dl'])*number(capacity['kappa_ml_o2_g_hb'])
    else:
        raise ValueError('Unknown capacity mode')
    spv, m = number(s['spv_fraction']), number(s['vo2_target_ml_kg_min'])
    if min(qp, qs, b) <= 0 or not 0 <= spv <= 1 or m < 0:
        raise ValueError('Reference input domain error')
    return qp, qs, b, spv, m


def independent_oracle(s: dict) -> tuple[dict, str]:
    qp, qs, b, spv, m = resolve(s)
    qt, r = qp+qs, qp/qs
    cpv = b*spv
    # Solve the two conservation relations by eliminating the arterial pool.
    # Venous content then determines arterial content through complete mixing.
    cv = cpv - 100*m*qt/(qp*qs)
    ca = (qp*cpv + qs*cv)/qt
    do2 = qs*ca/100
    pin, pout = qp*ca/100, qp*cpv/100
    sout = qs*cv/100
    # Exact identities, including formal raw states outside admissibility.
    assert pout-pin == m
    assert do2-sout == m
    assert do2 == qt*cpv/(100*(1+r))-m/r
    assert (qp*cpv+qs*cv)/100 == qt*ca/100
    assert (cv >= 0) == (m <= cpv*qp*qs/(100*qt))
    if m:
        assert ((ca-cv)/b)/(spv-ca/b) == r
    if spv == 0 and m == 0:
        status = 'degenerate_zero_oxygen'
    elif cv < 0:
        status = 'infeasible_requested_consumption'
    elif cv == 0:
        status = 'zero_venous_boundary'
    else:
        status = 'admissible'
    results = {
        'qp_ml_kg_min':qp, 'qs_ml_kg_min':qs, 'qt_ml_kg_min':qt, 'r':r,
        'capacity_ml_dl':b, 'cpv_ml_dl':cpv, 'ca_ml_dl':ca, 'cv_ml_dl':cv,
        'sa_fraction':ca/b, 'sv_fraction':cv/b, 'do2_ml_kg_min':do2,
        'oer_fraction':m/do2 if do2 else None,
        'omega':do2/m if m else None,
        'systemic_in_ml_kg_min':do2, 'systemic_out_ml_kg_min':sout,
        'systemic_net_use_ml_kg_min':do2-sout,
        'pulmonary_in_ml_kg_min':pin, 'pulmonary_out_ml_kg_min':pout,
        'pulmonary_net_add_ml_kg_min':pout-pin,
        'zero_venous_vo2_limit_ml_kg_min':cpv*qp*qs/(100*qt),
        'av_saturation_gap_fraction':(ca-cv)/b,
        'pv_a_saturation_gap_fraction':spv-ca/b,
        'r_fick':r if m else None,
    }
    return results, status


def main() -> int:
    fixture_file = HERE/'golden_cases.json'
    payload = json.loads(fixture_file.read_text())
    checked_metrics = 0
    for case in payload['cases']:
        actual, status = independent_oracle(case['scenario'])
        if status != case['expected_status']:
            raise AssertionError(f"{case['id']}: {status} != expected status")
        for metric, expected in case['expected_algebraic_metrics'].items():
            value = actual[metric]
            if expected is None:
                if value is not None:
                    raise AssertionError(f"{case['id']}/{metric}: expected undefined")
            elif value is None or not math.isclose(float(value), expected, rel_tol=1e-11, abs_tol=1e-11):
                raise AssertionError(f"{case['id']}/{metric}: {value} != {expected}")
            checked_metrics += 1
    rng = random.Random(20260918)
    feasible = 0
    for _ in range(2000):
        s = {
            'flow':{'mode':'independent_flows', 'qp_ml_kg_min':rng.randint(20,600), 'qs_ml_kg_min':rng.randint(20,600)},
            'capacity':{'mode':'hb_linear','hb_g_dl':rng.randint(6,24),'kappa_ml_o2_g_hb':1.34},
            'spv_fraction':rng.randint(60,100)/100,
            'vo2_target_ml_kg_min':rng.randint(0,240)/10,
        }
        vals, status = independent_oracle(s)
        feasible += status in ('admissible','zero_venous_boundary')
        # Joint flow/demand scaling is an additional exact invariance.
        t = json.loads(json.dumps(s))
        for key in ('qp_ml_kg_min','qs_ml_kg_min'):
            t['flow'][key] *= 3
        # Preserve the intended exact decimal during scaling.
        t['vo2_target_ml_kg_min'] = str(number(s['vo2_target_ml_kg_min'])*3)
        # Fraction strings such as 18/5 are accepted by this reference helper.
        scaled, _ = independent_oracle(t)
        for metric in ('sa_fraction','sv_fraction','ca_ml_dl','cv_ml_dl','oer_fraction','omega'):
            assert scaled[metric] == vals[metric]
        assert scaled['do2_ml_kg_min'] == 3*vals['do2_ml_kg_min']
        assert scaled['pulmonary_net_add_ml_kg_min'] == 3*vals['pulmonary_net_add_ml_kg_min']
    report = {
        'executed_utc':datetime.now(timezone.utc).isoformat(),
        'python':sys.version.split()[0],
        'status':'passed',
        'scope':'Specification reference-fixture arithmetic only; no production engine, browser, UI, performance, or deployment tests were run.',
        'golden_cases_checked':len(payload['cases']),
        'golden_metric_comparisons':checked_metrics,
        'seeded_states_checked':2000,
        'seeded_nonnegative_content_states':feasible,
        'seed':20260918,
        'identities':'Exact Fraction systemic, pulmonary, mixed-return, closed-form delivery, feasibility, Fick, and joint scaling identities.',
        'fixture_sha256':hashlib.sha256(fixture_file.read_bytes()).hexdigest(),
        'app_implementation_status':'not_implemented_in_this_pack',
        'app_acceptance_gates':'not_run',
    }
    (HERE/'checks_run.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
