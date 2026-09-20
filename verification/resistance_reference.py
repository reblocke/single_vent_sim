"""Independent reference calculator for the v1.2 specification, NOT app production code.

Only the standard library is required. Flows are absolute L/min, pressure is
mmHg, resistance is mmHg min/L, and physical O2 flux is mL O2/min. There is one
common downstream pressure. No pulsatility or Hb-to-resistance law is implied.
"""
from __future__ import annotations

from copy import deepcopy
import math
from typing import Any

VERSION = 'resistance-parallel-steady-v1'
PROFILES = [
    ('predominantly_systemic', 'Nicardipine', -0.30, -0.05),
    ('mixed_systemic_pulmonary', 'Milrinone', -0.18, -0.225),
    ('preferentially_pulmonary', 'Sildenafil', -0.10, -0.30),
    ('selectively_pulmonary', 'Inhaled nitric oxide', 0.0, -0.45),
    ('pulmonary_with_systemic', 'Epoprostenol', -0.15, -0.40),
]


def example() -> dict[str, Any]:
    return {
        'schema_version': 'resistance-experiment-v1',
        'flow_model_version': VERSION,
        'reference': {
            'rs_mmhg_min_l': 40.0, 'rp_mmhg_min_l': 12.0,
            'rshunt_nominal_mmhg_min_l': 28.0, 'qt_l_min': 2.0,
            'common_downstream_pressure_mmhg': 0.0,
        },
        'response': {'closure': 'nominal_parallel', 'alpha': 0.35,
                     'nonlinear_fraction': 0.5},
        'perturbation': {'scope': 'native_rp', 'rs_multiplier': 1.0,
                         'rp_multiplier': 1.0, 'rshunt_multiplier': 1.0},
        'oxygen': {'mode': 'normalized_source', 'spv_fraction': 0.99,
                   'normalized_consumption_l_min': 0.19},
    }


def changed(config: dict, *, ds=0.0, dp=0.0, effect_scale=1.0,
            alpha=None, fraction=None, closure=None, scope=None) -> dict:
    c = deepcopy(config)
    c['perturbation']['rs_multiplier'] = 1.0 + effect_scale*ds
    c['perturbation']['rp_multiplier'] = 1.0 + effect_scale*dp
    if alpha is not None:
        c['response']['alpha'] = alpha
    if fraction is not None:
        c['response']['nonlinear_fraction'] = fraction
    if closure is not None:
        c['response']['closure'] = closure
    if scope is not None:
        c['perturbation']['scope'] = scope
    return c


def validate(c: dict) -> None:
    """Strict small parser; unknown keys, booleans-as-numbers and mixed units fail."""
    def keys(x, expected):
        if not isinstance(x, dict) or set(x) != set(expected):
            raise ValueError(f'Expected exactly these fields: {expected}')
    def num(v, lo=None, hi=None, exclusive=False):
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
            raise ValueError('A finite number is required')
        if lo is not None and (v < lo or exclusive and v == lo):
            raise ValueError('Value below permitted domain')
        if hi is not None and v > hi:
            raise ValueError('Value above permitted domain')
    keys(c, ('schema_version','flow_model_version','reference','response','perturbation','oxygen'))
    if c['schema_version'] != 'resistance-experiment-v1' or c['flow_model_version'] != VERSION:
        raise ValueError('Unknown schema or flow-model version')
    b, r, p, o = (c[k] for k in ('reference','response','perturbation','oxygen'))
    keys(b, ('rs_mmhg_min_l','rp_mmhg_min_l','rshunt_nominal_mmhg_min_l',
             'qt_l_min','common_downstream_pressure_mmhg'))
    keys(r, ('closure','alpha','nonlinear_fraction'))
    keys(p, ('scope','rs_multiplier','rp_multiplier','rshunt_multiplier'))
    num(b['rs_mmhg_min_l'], 0, exclusive=True)
    num(b['qt_l_min'], 0, exclusive=True)
    num(b['rp_mmhg_min_l'], 0)
    num(b['rshunt_nominal_mmhg_min_l'], 0)
    num(b['common_downstream_pressure_mmhg'])
    num(r['alpha'], 0, 1)
    num(r['nonlinear_fraction'], 0, 1)
    if r['closure'] not in ('nominal_parallel','circuit_secant'):
        raise ValueError('Unsupported afterload closure')
    if p['scope'] not in ('native_rp','whole_pathway_audit'):
        raise ValueError('Unsupported perturbation scope')
    num(p['rs_multiplier'], 0, exclusive=True)
    num(p['rp_multiplier'], 0)
    num(p['rshunt_multiplier'], 0)
    if p['scope'] == 'whole_pathway_audit':
        if r['alpha'] != 0 or r['nonlinear_fraction'] != 0 or p['rshunt_multiplier'] != 1:
            raise ValueError('Whole-pathway audit is fixed-output, linear, without extra shunt perturbation')
    if b['rp_mmhg_min_l'] + b['rshunt_nominal_mmhg_min_l'] <= 0:
        raise ValueError('Reference pulmonary pathway must have positive resistance')
    if o.get('mode') == 'normalized_source':
        keys(o, ('mode','spv_fraction','normalized_consumption_l_min'))
        num(o['normalized_consumption_l_min'], 0)
    elif o.get('mode') == 'physical':
        keys(o, ('mode','spv_fraction','hb_g_dl','kappa_ml_o2_g_hb','vo2_ml_min'))
        num(o['hb_g_dl'], 0, exclusive=True)
        num(o['kappa_ml_o2_g_hb'], 0, exclusive=True)
        num(o['vo2_ml_min'], 0)
    else:
        raise ValueError('Unsupported oxygen mode')
    num(o['spv_fraction'], 0, 1)


def harmonic(rs: float, rp: float) -> float:
    if rs <= 0 or rp <= 0:
        raise ValueError('Equivalent-resistance paths must be positive')
    small, large = sorted((rs, rp))
    return small / (1 + small/large)


def at_total(qt: float, rs: float, rp: float, k1: float, k2: float) -> dict:
    """Stable positive root; no rounding of flows before oxygen accounting."""
    linear = rs + rp + k1
    if k2 == 0:
        qp = qt * (rs/linear)
    else:
        discriminant = math.hypot(linear, 2*math.sqrt(k2)*math.sqrt(rs)*math.sqrt(qt))
        qp = 2*rs*qt / (linear + discriminant)
    dp = (rp + k1 + k2*qp)*qp
    qs = dp/rs  # avoids subtracting almost-equal Qt and Qp at extreme allocation
    return {'qp_l_min':qp, 'qs_l_min':qs, 'qt_l_min':qp+qs,
            'driving_pressure_mmhg':dp}


def at_pressure(dp: float, rs: float, rp: float, k1: float, k2: float) -> dict:
    linear = rp + k1
    if k2 == 0:
        qp = dp/linear
    else:
        disc = math.hypot(linear, 2*math.sqrt(k2)*math.sqrt(dp))
        qp = 2*dp/(linear+disc)
    qs = dp/rs
    return {'qp_l_min':qp, 'qs_l_min':qs, 'qt_l_min':qp+qs,
            'driving_pressure_mmhg':dp}


def resolve_hemodynamics(c: dict) -> dict:
    validate(c)
    b, response, pert = c['reference'],c['response'],c['perturbation']
    rs0, rp0, sh0, qt0 = (b[k] for k in ('rs_mmhg_min_l','rp_mmhg_min_l',
                                        'rshunt_nominal_mmhg_min_l','qt_l_min'))
    f, alpha = response['nonlinear_fraction'],response['alpha']
    ra0 = harmonic(rs0, rp0+sh0)
    qcal = qt0*rs0/(rs0+rp0+sh0)
    dp0 = qt0*ra0
    rs = rs0*pert['rs_multiplier']
    rp = rp0*pert['rp_multiplier']
    sh = sh0*pert['rshunt_multiplier']
    if pert['scope'] == 'whole_pathway_audit':
        sh *= pert['rp_multiplier']
    if rp + sh <= 0:
        raise ValueError('Current pulmonary pathway must have positive resistance')
    k1 = (1-f)*sh
    k2 = f*sh/qcal
    ra = harmonic(rs, rp+sh)
    if rs == rs0 and rp == rp0 and sh == sh0:
        requested_qt = qt0
        result = at_total(qt0,rs,rp,k1,k2)
    elif response['closure'] == 'nominal_parallel' or k2 == 0:
        requested_qt = qt0*math.exp(alpha*math.log(ra0/ra))
        result = at_total(requested_qt,rs,rp,k1,k2)
    elif alpha == 0:
        requested_qt = qt0
        result = at_total(qt0,rs,rp,k1,k2)
    elif alpha == 1:
        result = at_pressure(dp0,rs,rp,k1,k2)
        requested_qt = result['qt_l_min']
    else:
        # Solve a strictly increasing residual on log total flow.
        def evaluate(log_q_ratio):
            q = qt0*math.exp(log_q_ratio)
            state = at_total(q,rs,rp,k1,k2)
            return ((1-alpha)*log_q_ratio +
                    alpha*math.log(state['driving_pressure_mmhg']/dp0))
        lo,hi = -1.0,1.0
        for _ in range(128):
            if evaluate(lo) <= 0 <= evaluate(hi):
                break
            if evaluate(lo)>0: lo *= 2
            if evaluate(hi)<0: hi *= 2
        else:
            raise ArithmeticError('Unable to bracket circuit-secant closure')
        for _ in range(60):
            mid=(lo+hi)/2
            if mid == lo or mid == hi:
                break
            if evaluate(mid)>0: hi=mid
            else: lo=mid
        requested_qt = qt0*math.exp((lo+hi)/2)
        result = at_total(requested_qt,rs,rp,k1,k2)
    qp,qs,qt,dp = (result[k] for k in ('qp_l_min','qs_l_min','qt_l_min','driving_pressure_mmhg'))
    actual_r = dp/qt
    used_r = ra if response['closure']=='nominal_parallel' else actual_r
    result.update({
        'r':qp/qs, 'arterial_pressure_mmhg':b['common_downstream_pressure_mmhg']+dp,
        'rs_mmhg_min_l':rs, 'rp_mmhg_min_l':rp, 'rshunt_nominal_mmhg_min_l':sh,
        'k1_mmhg_min_l':k1, 'k2_mmhg_min2_l2':k2,
        'calibration_qp_l_min':qcal, 'reference_driving_pressure_mmhg':dp0,
        'nominal_afterload_mmhg_min_l':ra,
        'circuit_secant_afterload_mmhg_min_l':actual_r,
        'circuit_incremental_resistance_mmhg_min_l':harmonic(rs,rp+k1+2*k2*qp),
        'shunt_secant_resistance_mmhg_min_l':k1+k2*qp,
        'shunt_incremental_resistance_mmhg_min_l':k1+2*k2*qp,
        'pulmonary_vascular_drop_mmhg':rp*qp,
        'shunt_drop_mmhg':k1*qp+k2*qp*qp,
        'native_fraction_nominal':rp/(rp+sh),
        'native_fraction_operating':rp/(rp+k1+k2*qp),
        'requested_qt_l_min':requested_qt,
        'flow_balance_residual_l_min':qt-requested_qt,
        'pressure_balance_residual_mmhg':rs*qs-(rp+k1)*qp-k2*qp*qp,
        'output_law_log_residual':math.log(qt/qt0)+alpha*math.log(used_r/ra0),
    })
    if not all(math.isfinite(v) for v in result.values()):
        raise ArithmeticError('Non-finite hemodynamic calculation')
    return result


def transport(qp: float, qs: float, o: dict) -> dict:
    """Common reference oxygen accounting; normalized and physical modes differ in units."""
    spv = o['spv_fraction']
    if o['mode'] == 'physical':
        B = o['hb_g_dl']*o['kappa_ml_o2_g_hb']
        k = o['vo2_ml_min']/(10*B)
    else:
        B = None
        k = o['normalized_consumption_l_min']
    sa = spv-k/qp
    sv = sa-k/qs
    tol = 1e-12*max(1,abs(sa),abs(sv))
    if sv < -tol: status = 'infeasible_requested_consumption'
    elif k == 0 and spv == 0: status = 'degenerate_zero_oxygen'
    elif abs(sv) <= tol: status = 'zero_venous_boundary'
    else: status = 'admissible'
    index = qs*sa
    base = {
        'sa_fraction':sa,'sv_fraction':sv,'delivery_index_l_min':index,
        'normalized_consumption_l_min':k,
        'normalized_systemic_out_l_min':qs*sv,
        'normalized_pulmonary_in_l_min':qp*sa,
        'normalized_pulmonary_out_l_min':qp*spv,
        'normalized_pulmonary_net_l_min':qp*(spv-sa),
        'normalized_systemic_net_l_min':qs*(sa-sv),
        'normalized_zero_venous_limit_l_min':spv*qp*qs/(qp+qs),
        'oer_fraction':k/index if index!=0 else None,
        'omega':index/k if k!=0 else None,
        'mixing_residual_fraction':sa-(qs*sv+qp*spv)/(qp+qs),
    }
    physical = {name: None for name in ('capacity_ml_dl','cpv_ml_dl','ca_ml_dl','cv_ml_dl',
        'vo2_ml_min','do2_ml_min','systemic_out_ml_min','pulmonary_in_ml_min',
        'pulmonary_out_ml_min','pulmonary_net_add_ml_min','systemic_net_use_ml_min')}
    if B is not None:
        physical.update(capacity_ml_dl=B,cpv_ml_dl=B*spv,ca_ml_dl=B*sa,cv_ml_dl=B*sv,
                        vo2_ml_min=o['vo2_ml_min'],do2_ml_min=10*B*index,
                        systemic_out_ml_min=10*B*qs*sv,
                        pulmonary_in_ml_min=10*B*qp*sa,
                        pulmonary_out_ml_min=10*B*qp*spv,
                        pulmonary_net_add_ml_min=10*B*qp*(spv-sa),
                        systemic_net_use_ml_min=10*B*qs*(sa-sv))
    base.update(physical)
    raw = base.copy()
    # Finite inadmissible values remain in audit only. A solved circuit is retained.
    if status == 'infeasible_requested_consumption':
        base = {key:None for key in base}
    return {'status':status,'metrics':base,'audit':raw,
            'units_mode':o['mode'], 'physical_do2_available':B is not None}


def solve(c: dict) -> dict:
    h = resolve_hemodynamics(c)
    o = transport(h['qp_l_min'],h['qs_l_min'],c['oxygen'])
    return {'schema_version':'resistance-result-v1','scenario':deepcopy(c),
            'hemodynamic_status':'solved','hemodynamics':h,'oxygen':o}


def baseline(c: dict) -> dict:
    b = deepcopy(c)
    b['perturbation'].update(rs_multiplier=1.0,rp_multiplier=1.0,rshunt_multiplier=1.0)
    return b


def compare(c: dict) -> dict:
    a,b = solve(baseline(c)),solve(c)
    metric='do2_ml_min' if c['oxygen']['mode']=='physical' else 'delivery_index_l_min'
    allowed = all(x['oxygen']['status']=='admissible' for x in (a,b))
    d0=a['oxygen']['metrics'][metric]
    d1=b['oxygen']['metrics'][metric]
    delta=100*(d1/d0-1) if allowed and d0 and d0>0 else None
    return {'baseline':a,'perturbed':b,'comparison_metric':metric,
            'delta_percent':delta,'eligible_pair':bool(allowed),
            'reference_is_frozen':True}
