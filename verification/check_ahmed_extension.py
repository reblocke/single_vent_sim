#!/usr/bin/env python3
"""Independent checks for the 1.1 specification, NOT a production app engine.

Run: python verification/check_ahmed_extension.py
Only Python's standard library is required. Exact rational input arithmetic
and the inherited mixed-return oracle verify the committed native-BSA fixtures.
The helpers here are reference mathematics, not implementations of the proposed
public APIs. No full-text Ahmed reconstruction or browser validation is claimed.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from fractions import Fraction as F
import hashlib
import json
import math
from pathlib import Path
import random
import sys

from check_golden import independent_oracle

HERE = Path(__file__).resolve().parent
SEED = 20260918
ALPHA, BETA = F(7, 10), F(2, 5)


def q(value: object) -> F:
    return value if isinstance(value, F) else F(str(value))


def close(actual: object, expected: object, label: str, rtol: float = 1e-10,
          atol: float = 1e-10) -> None:
    if expected is None:
        assert actual is None, (label, actual, expected)
    else:
        assert actual is not None and math.isclose(float(actual), float(expected),
            rel_tol=rtol, abs_tol=atol), (label, actual, expected)


def resolve_native(scenario: dict) -> tuple[F, F, F, F, F, F, F]:
    """Resolve BSA-native values p,s,h,k,Spv,M,total with rational arithmetic."""
    assert scenario['indexing_basis'] == 'per_m2'
    flow, cap = scenario['flow'], scenario['capacity']
    assert cap['mode'] == 'hb_linear'
    if flow['mode'] == 'total_ratio':
        total, r = q(flow['qt_l_min_m2']), q(flow['r'])
        p, s = total*r/(1+r), total/(1+r)
    else:
        p, s = q(flow['qp_l_min_m2']), q(flow['qs_l_min_m2'])
        total = p+s
    return (p, s, q(cap['hb_g_dl']), q(cap['kappa_ml_o2_g_hb']),
            q(scenario['spv_fraction']), q(scenario['vo2_target_ml_min_m2']), total)


def reference(scenario: dict) -> tuple[dict, str]:
    """Use the old TEST oracle on consistently rescaled reference-unit numbers.

    The inherited oracle uses legacy ``_kg`` key spellings. In this test-only
    adapter those slots contain mL/min/m2 and mL O2/min/m2 consistently, before
    output keys are renamed. No physiological conversion of kg to m2 is assumed.
    The production contract instead requires basis-neutral internals and typed
    metadata; this legacy-key adapter is NOT production architecture.
    """
    p, s, h, k, spv, m, _ = resolve_native(scenario)
    oracle_input = {
        'flow': {'mode': 'independent_flows',
                 'qp_ml_kg_min': str(1000*p), 'qs_ml_kg_min': str(1000*s)},
        'capacity': {'mode': 'hb_linear', 'hb_g_dl': str(h),
                     'kappa_ml_o2_g_hb': str(k)},
        'spv_fraction': str(spv), 'vo2_target_ml_kg_min': str(m),
    }
    old, status = independent_oracle(oracle_input)
    values = {}
    for key, value in old.items():
        if key in ('qp_ml_kg_min', 'qs_ml_kg_min', 'qt_ml_kg_min'):
            values[key.replace('_ml_kg_min', '_l_min_m2')] = value/1000
        else:
            values[key.replace('_ml_kg_min', '_ml_min_m2')] = value
    # Native L/dL formulation is independently checked against mixed-return math.
    assert values['ca_ml_dl'] == k*h*spv - m/(10*p)
    assert values['cv_ml_dl'] == k*h*spv - m*(1/p+1/s)/10
    assert values['do2_ml_min_m2'] == 10*s*values['ca_ml_dl']
    return values, status


def scenario(h=14, total=6, r=1, m=150, spv=F(98,100), k=F(134,100)) -> dict:
    return {
        'schema_version':'scenario-v2', 'model_version':'barnea-parallel-bound-o2-v1',
        'indexing_basis':'per_m2',
        'flow':{'mode':'total_ratio', 'qt_l_min_m2':total, 'r':r},
        'capacity':{'mode':'hb_linear', 'hb_g_dl':h, 'kappa_ml_o2_g_hb':k},
        'spv_fraction':spv, 'vo2_target_ml_min_m2':m,
    }


def meets(values: dict, a=ALPHA, b=BETA) -> bool:
    return values['sa_fraction'] > a and values['sv_fraction'] > b


def bounds(sc: dict, a=ALPHA, b=BETA) -> dict:
    p,s,h,k,spv,m,t = resolve_native(sc)
    if m == 0:
        return {'status':'no_positive_lower_bound' if spv > a and spv > b
                         else 'no_solution_at_endpoint'}
    if spv <= a or spv <= b:
        return {'status':'no_finite_solution'}
    r = p/s
    ha = m/(10*k*p*(spv-a))
    hv = m*(1/p+1/s)/(10*k*(spv-b))
    ta = m*(1+r)/(10*k*h*r*(spv-a))
    tv = m*(1+r)**2/(10*k*h*r*(spv-b))
    ma = 10*k*h*p*(spv-a)
    mv = 10*k*h*(spv-b)/(1/p+1/s)
    return dict(status='finite', ha=ha, hv=hv, hj=max(ha,hv),
                ta=ta, tv=tv, tj=max(ta,tv), ma=ma, mv=mv, mj=min(ma,mv))


def ratio_interval(sc: dict, a=ALPHA, b=BETA) -> tuple[float,float] | None:
    p,s,h,k,spv,m,t = resolve_native(sc)
    assert m > 0
    u=m/(10*k*h*t)
    if spv-a <= u or spv-b <= 4*u:
        return None
    ar=float(u/(spv-a-u))
    bf,uf=float(spv-b),float(u)
    disc=math.sqrt(bf*(bf-4*uf))
    vl=2*uf/(bf-2*uf+disc)
    vh=1/vl
    low=max(ar,vl)
    return (low,vh) if low < vh else None


def changed(sc: dict, *, hb=None, ci=None, r=None, m=None) -> dict:
    out=deepcopy(sc)
    if hb is not None: out['capacity']['hb_g_dl']=hb
    if ci is not None: out['flow']['qt_l_min_m2']=ci
    if r is not None: out['flow']['r']=r
    if m is not None: out['vo2_target_ml_min_m2']=m
    return out


def main() -> int:
    payload=json.loads((HERE/'ahmed_golden_cases.json').read_text())
    metric_checks=0
    for case in payload['cases']:
        val,status=reference(case['scenario'])
        assert status == case['expected_status'], case['id']
        for name,expected in case['expected_algebraic_metrics'].items():
            close(val[name],expected,case['id']+'/'+name)
            metric_checks += 1
        assert (val['sa_fraction'] > ALPHA) == case['expected_criterion_above']['arterial']
        assert (val['sv_fraction'] > BETA) == case['expected_criterion_above']['venous']

    cp=json.loads((HERE/'ahmed_boundary_checkpoints.json').read_text())
    fixed=scenario()
    b=bounds(fixed)
    close(b['ha'],cp['hb_sa'],'Hb arterial boundary')
    close(b['hv'],cp['hb_sv'],'Hb venous boundary')
    close(bounds(scenario(h=9))['tj'],cp['ci_joint_at_hb9'],'CI joint boundary')
    ri=ratio_interval(scenario(h=13))
    assert ri is not None
    close(ri[0],cp['hb13_ratio_lower'],'ratio low')
    close(ri[1],cp['hb13_ratio_upper'],'ratio high')

    # Source-associated example: a permissible state can miss just one criterion.
    at13,st13=reference(scenario(h=13))
    assert st13 == 'admissible'
    assert at13['sa_fraction'] < ALPHA and at13['sv_fraction'] > BETA
    assert meets(reference(scenario(h=13,r=F(11,10)))[0])

    # No-solution and zero-demand cases; none silently changes the endpoint.
    special_checks=0
    for endpoint in (F(0),BETA,ALPHA):
        assert bounds(scenario(spv=endpoint))['status'] == 'no_finite_solution'
        special_checks += 1
    assert bounds(scenario(m=0))['status'] == 'no_positive_lower_bound'
    assert bounds(scenario(m=0,spv=ALPHA))['status'] == 'no_solution_at_endpoint'
    special_checks += 2
    zero,_=reference(scenario(m=0))
    zero_higher,_=reference(scenario(h=16,m=0))
    assert zero['sa_fraction'] == zero_higher['sa_fraction'] == F(98,100)
    assert zero['sv_fraction'] == zero_higher['sv_fraction'] == F(98,100)
    assert zero['omega'] is None and zero['oer_fraction'] == 0
    # Exact tangency Sv=beta at r=1: there is no nonempty strict interval.
    tangent_m=(F(98,100)-BETA)*10*F(134,100)*14*6/4
    tangent=scenario(m=tangent_m)
    assert reference(tangent)[0]['sv_fraction'] == BETA
    assert ratio_interval(tangent) is None
    special_checks += 2

    rng=random.Random(SEED)
    n=2000
    admissible=0
    exact_boundary_checks=0
    interval_checks=0
    finite_difference_checks=0
    conversion_checks=0
    objective_checks=0
    for i in range(n):
        sc=scenario(h=F(rng.randint(60,220),10),total=F(rng.randint(20,120),10),
                    r=F(rng.randint(2,40),10),m=rng.randint(50,250),
                    spv=F(rng.randint(75,100),100),
                    k=F(rng.choice((134,138)),100))
        p,s,h,k,spv,m,t=resolve_native(sc)
        val,status=reference(sc)
        admissible += status in ('admissible','zero_venous_boundary')
        bd=bounds(sc)
        assert bd['status'] == 'finite'
        assert meets(val) == (h > bd['hj'])
        assert meets(val) == (t > bd['tj'])
        assert meets(val) == (m < bd['mj'])
        assert bd['mj'] < val['zero_venous_vo2_limit_ml_min_m2']

        # Exact-rational below/on/above equality states. No plotting or rounding.
        epsilon=F(1,10**8)
        for param,key,increasing in (('hb','hj',True),('ci','tj',True),('m','mj',False)):
            equality,_=reference(changed(sc,**{param:bd[key]}))
            assert min(equality['sa_fraction']-ALPHA,equality['sv_fraction']-BETA) == 0
            assert not meets(equality)
            lower,_=reference(changed(sc,**{param:bd[key]*(1-epsilon)}))
            higher,_=reference(changed(sc,**{param:bd[key]*(1+epsilon)}))
            assert meets(lower) is (not increasing)
            assert meets(higher) is increasing
            exact_boundary_checks += 3

        delta=F(rng.randint(1,40),10)
        high,highstatus=reference(changed(sc,hb=h+delta))
        ka=m/(10*k*p)
        kv=m*(1/p+1/s)/(10*k)
        assert high['sa_fraction']-val['sa_fraction'] == ka*delta/(h*(h+delta))
        assert high['sv_fraction']-val['sv_fraction'] == kv*delta/(h*(h+delta))
        assert high['do2_ml_min_m2']-val['do2_ml_min_m2'] == 10*s*k*spv*delta
        assert high['pulmonary_net_add_ml_min_m2'] == val['pulmonary_net_add_ml_min_m2'] == m
        assert kv == (1+p/s)*ka
        assert -2*ka/h**3 < 0 and -2*kv/h**3 < 0
        # Centered differences are checked only in admissible neighborhoods.
        if status == 'admissible':
            step=h*F(1,100000)
            plus,ps=reference(changed(sc,hb=h+step))
            minus,ms=reference(changed(sc,hb=h-step))
            if ps == ms == 'admissible':
                for name,analytic in (('sa_fraction',ka/h**2),('sv_fraction',kv/h**2),
                                      ('do2_ml_min_m2',10*s*k*spv)):
                    fd=(plus[name]-minus[name])/(2*step)
                    close(fd,analytic,f'derivative/{i}/{name}',rtol=1e-5)
                    finite_difference_checks += 1

        interval=ratio_interval(sc)
        for trial_r in (F(1,5),q(sc['flow']['r']),F(1),F(4)):
            trial,_=reference(changed(sc,r=trial_r))
            expected=meets(trial)
            # Float roots are interpreted away from their equality tolerance.
            if interval and min(abs(float(trial_r)-x) for x in interval) < 1e-8:
                continue
            actual=(interval is not None and interval[0] < float(trial_r) < interval[1])
            assert actual == expected, (i,interval,float(trial_r),expected)
            interval_checks += 1
        if interval:
            for bound in interval:
                end,_=reference(changed(sc,r=bound))
                close(min(end['sa_fraction']-ALPHA,end['sv_fraction']-BETA),
                      0,f'interval boundary {i}',atol=1e-9)
            # Intersect with explicit inclusive display bounds; endpoint closure
            # is determined by forward strict-criterion membership, not rounding.
            lo,hi=max(interval[0],.25),min(interval[1],2.)
            if lo < hi:
                mid,_=reference(changed(sc,r=(lo+hi)/2))
                assert meets(mid)

        # Convert a BSA-native state to per kg with explicitly supplied size.
        mass=F(rng.randint(20,100),10)
        bsa=F(rng.randint(15,50),100)
        kg={
            'flow':{'mode':'independent_flows',
                    'qp_ml_kg_min':str(1000*p*bsa/mass),
                    'qs_ml_kg_min':str(1000*s*bsa/mass)},
            'capacity':{'mode':'hb_linear','hb_g_dl':str(h),'kappa_ml_o2_g_hb':str(k)},
            'spv_fraction':str(spv),'vo2_target_ml_kg_min':str(m*bsa/mass),
        }
        kgval,kgstatus=independent_oracle(kg)
        assert kgstatus == status
        for name in ('sa_fraction','sv_fraction','ca_ml_dl','cv_ml_dl','capacity_ml_dl',
                     'cpv_ml_dl','r','oer_fraction','omega'):
            assert val[name] == kgval[name]
        for name,value in kgval.items():
            if name.endswith('_ml_kg_min') and not name.startswith(('qp_','qs_','qt_')):
                assert val[name.replace('_ml_kg_min','_ml_min_m2')] == value*mass/bsa
        conversion_checks += 1

        # Distinct objectives under fixed total flow, when a solution exists.
        A=10*t*k*h*spv
        if A > 4*m:
            rs=1/(math.sqrt(float(A/m))-1)
            peak,peak_status=reference(changed(sc,r=rs))
            unity,_=reference(changed(sc,r=1))
            assert 0 < rs < 1 and peak_status == 'admissible'
            assert peak['do2_ml_min_m2'] >= unity['do2_ml_min_m2']
            assert unity['sv_fraction'] >= peak['sv_fraction']
            for neighbor in (rs*(1-1e-3),rs*(1+1e-3)):
                vv,_=reference(changed(sc,r=neighbor))
                assert peak['do2_ml_min_m2'] > vv['do2_ml_min_m2']
            objective_checks += 1

    # No Hb=12 or Hb=13 discontinuity in the reference derivative.
    for center in (F(12),F(13)):
        left,_=reference(scenario(h=center-F(1,100000)))
        right,_=reference(scenario(h=center+F(1,100000)))
        assert right['sa_fraction'] > left['sa_fraction']
        close((right['sa_fraction']-left['sa_fraction'])/F(2,100000),
              F(150)/(10*F(134,100)*3*center**2),f'continuous at {center}',rtol=1e-7)

    report={
        'executed_utc':datetime.now(timezone.utc).isoformat(),
        'python':sys.version.split()[0], 'status':'passed',
        'scope':'Reference arithmetic and derived-constraint verification only. No production engine, UI, browser, exact Ahmed replication, or clinical validation.',
        'golden_cases_checked':len(payload['cases']), 'golden_metric_comparisons':metric_checks,
        'explicit_boundary_checkpoints':5, 'special_case_groups':special_checks,
        'seed':SEED, 'seeded_states_checked':n,
        'seeded_nonnegative_content_states':admissible,
        'exact_forward_boundary_state_checks':exact_boundary_checks,
        'ratio_interval_membership_checks':interval_checks,
        'centered_finite_difference_checks':finite_difference_checks,
        'explicit_body_size_conversion_cases':conversion_checks,
        'distinct_objective_cases':objective_checks,
        'fixture_sha256':hashlib.sha256((HERE/'ahmed_golden_cases.json').read_bytes()).hexdigest(),
        'source_full_text_status':'blocked_source_unavailable',
        'source_scope':'abstract_and_bibliographic_metadata_verified; constants/figures unverified',
        'app_implementation_status':'not_implemented_in_this_pack',
        'app_acceptance_gates':'not_run',
    }
    (HERE/'ahmed_checks_run.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
