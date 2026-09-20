#!/usr/bin/env python3
"""Verify reference arithmetic, model distinctions and immutable paper comparisons.

No production/browser or clinical validation is claimed. Run without Python -O.
"""
from __future__ import annotations
import argparse
from copy import deepcopy
from datetime import datetime,timezone
import hashlib
import json
import math
from pathlib import Path
import random
import sys

from resistance_reference import example,changed,solve,compare,PROFILES,validate
from resistance_oracle import oracle

HERE=Path(__file__).resolve().parent
SEED=2026091803


def near(a,b,label='',atol=1e-10,rtol=1e-10):
    if b is None:
        assert a is None,(label,a,b)
    else:
        assert a is not None and math.isclose(a,b,abs_tol=atol,rel_tol=rtol),(label,a,b)


def verify():
    assert __debug__,'Reference checks must not be run with assertions disabled'
    fixtures=json.loads((HERE/'savorgnan_golden_cases.json').read_text())
    metrics=0
    for row in fixtures['cases']:
        actual=solve(row['scenario'])
        assert actual['oxygen']['status']==row['expected_status'],row['id']
        values={**actual['hemodynamics'],**actual['oxygen']['audit']}
        for key,expected in row['expected'].items():
            near(values[key],expected,(row['id'],key)); metrics+=1
        if actual['oxygen']['status']=='infeasible_requested_consumption':
            assert all(v is None for v in actual['oxygen']['metrics'].values())

    # Mandatory mechanistic examples; independently evaluated from input identities.
    base=example(); a=solve(base)
    near(a['hemodynamics']['qp_l_min'],1)
    near(a['hemodynamics']['qs_l_min'],1)
    near(a['hemodynamics']['shunt_secant_resistance_mmhg_min_l'],28)
    near(a['hemodynamics']['shunt_incremental_resistance_mmhg_min_l'],42)
    near(a['hemodynamics']['driving_pressure_mmhg'],40)
    near(14*1.2+14*1.2**2,36.96)
    near((12*.55+28)/40,.865)
    native=solve(changed(base,dp=-.45,alpha=0,fraction=0))
    audit=solve(changed(base,dp=-.45,alpha=0,fraction=0,scope='whole_pathway_audit'))
    near(native['hemodynamics']['r'],40/34.6)
    near(audit['hemodynamics']['r'],40/22)
    assert abs(native['hemodynamics']['r']-audit['hemodynamics']['r'])>.6

    # Tables preserve reported values, not only a claimed whole-table match.
    source=json.loads((HERE/'savorgnan_source_claims.json').read_text())
    table3_checks=0; extra_t1_discrepancies=[]
    for row in source['table3']:
        profile=next(p for p in PROFILES if p[0]==row['profile_id'])
        _,_,ds,dp=profile
        out=compare(changed(base,ds=ds,dp=dp))
        h=out['perturbed']['hemodynamics']
        for key in ('qt_l_min','qs_l_min','qp_l_min','r'):
            near(h[key],row[key],(row['profile_id'],key),atol=.00050001,rtol=0)
            table3_checks+=1
        near(out['delta_percent'],row['delta_delivery_percent'],row['profile_id'],atol=.05000001,rtol=0)
        table3_checks+=1
    for row in source['table1'][1:]:
        c=changed(base,ds=row['delta_rs_fraction'],dp=row['delta_rp_fraction'],
                  alpha=0,fraction=0,scope='whole_pathway_audit')
        out=compare(c); h=out['perturbed']['hemodynamics']; o=out['perturbed']['oxygen']['metrics']
        near(h['r'],row['r'],atol=.00500001,rtol=0)
        near(out['delta_percent'],row['delta_delivery_percent'],atol=.05000001,rtol=0)
        for key in ('sa_fraction','sv_fraction','delivery_index_l_min'):
            if abs(o[key]-row[key]) > .00050001:
                extra_t1_discrepancies.append({'profile':row['profile_id'],'metric':key,
                    'reported':row[key],'computed_whole_pathway':o[key]})
    assert len(extra_t1_discrepancies)>=3,'Do not tune k to hide Table1 saturation mismatches'

    rng=random.Random(SEED)
    n=2000; oracle_cases=0; feasible=0; max_pressure=0.; max_flow=0.; max_law=0.
    for i in range(n):
        c=example(); b=c['reference']; r=c['response']; p=c['perturbation']
        b.update(rs_mmhg_min_l=rng.uniform(10,100),rp_mmhg_min_l=rng.uniform(0,45),
                 rshunt_nominal_mmhg_min_l=rng.uniform(0,70),qt_l_min=rng.uniform(.2,4),
                 common_downstream_pressure_mmhg=rng.uniform(-5,15))
        r.update(alpha=rng.uniform(0,1),nonlinear_fraction=rng.uniform(0,1),
                 closure='circuit_secant' if i%5==0 else 'nominal_parallel')
        p.update(rs_multiplier=rng.uniform(.2,2),rp_multiplier=rng.uniform(.1,2),
                 rshunt_multiplier=rng.uniform(.25,1.75))
        c['oxygen'].update(spv_fraction=rng.uniform(.8,1),normalized_consumption_l_min=rng.uniform(0,.5))
        s=solve(c); h=s['hemodynamics']; o=s['oxygen']['audit']
        qp,qs,qt=h['qp_l_min'],h['qs_l_min'],h['qt_l_min']
        near(qp+qs,qt)
        near(h['pressure_balance_residual_mmhg'],0,atol=1e-9)
        near(h['flow_balance_residual_l_min'],0,atol=1e-9)
        near(h['output_law_log_residual'],0,atol=1e-10)
        max_pressure=max(max_pressure,abs(h['pressure_balance_residual_mmhg']))
        max_flow=max(max_flow,abs(h['flow_balance_residual_l_min']))
        max_law=max(max_law,abs(h['output_law_log_residual']))
        near(o['normalized_pulmonary_net_l_min'],c['oxygen']['normalized_consumption_l_min'])
        near(o['normalized_systemic_net_l_min'],c['oxygen']['normalized_consumption_l_min'])
        near(o['mixing_residual_fraction'],0)
        if s['oxygen']['status']=='admissible':
            feasible+=1
            near(o['oer_fraction']*o['omega'],1)
        else:
            assert s['oxygen']['metrics']['sv_fraction'] is None
        if i<80:
            expected,status=oracle(c); oracle_cases+=1
            assert status==s['oxygen']['status']
            values={**h,**o}
            for key,value in expected.items():near(values[key],value,(i,key))
        # Nominal and circuit-secant laws collapse to the same law if the shunt is linear.
        cl=deepcopy(c);cl['response']['nonlinear_fraction']=0
        cl['response']['closure']='nominal_parallel';one=solve(cl)['hemodynamics']
        cl['response']['closure']='circuit_secant';two=solve(cl)['hemodynamics']
        for key in ('qp_l_min','qs_l_min','qt_l_min','driving_pressure_mmhg'):near(one[key],two[key])
        # Incremental pressure slope is NOT the secant resistance in nonlinear shunts.
        eps=qp*1e-5; k1=h['k1_mmhg_min_l'];k2=h['k2_mmhg_min2_l2']
        slope=((k1*(qp+eps)+k2*(qp+eps)**2)-(k1*(qp-eps)+k2*(qp-eps)**2))/(2*eps)
        near(slope,h['shunt_incremental_resistance_mmhg_min_l'],rtol=1e-8)

    for fraction in (0,.5,1):
        c=changed(base,dp=-.45,alpha=1,fraction=fraction,closure='circuit_secant')
        near(solve(c)['hemodynamics']['driving_pressure_mmhg'],40)
    c=changed(base,dp=-.45,alpha=1,fraction=.5)
    assert not math.isclose(solve(c)['hemodynamics']['driving_pressure_mmhg'],40,rel_tol=1e-3)

    # Explicit shared pressure offset must not change blood flow.
    c=changed(base,dp=-.45);one=solve(c)
    c['reference']['common_downstream_pressure_mmhg']=7;two=solve(c)
    near(two['hemodynamics']['qp_l_min'],one['hemodynamics']['qp_l_min'])
    near(two['hemodynamics']['arterial_pressure_mmhg']-one['hemodynamics']['arterial_pressure_mmhg'],7)

    # Re-expressing a flow scale requires first- and second-order resistance conversion.
    c=changed(base,ds=-.18,dp=-.225,closure='circuit_secant');one=solve(c)
    scale=2.7; t=deepcopy(c)
    for key in ('rs_mmhg_min_l','rp_mmhg_min_l','rshunt_nominal_mmhg_min_l'):
        t['reference'][key]/=scale
    t['reference']['qt_l_min']*=scale
    t['oxygen']['normalized_consumption_l_min']*=scale
    two=solve(t)
    for key in ('qp_l_min','qs_l_min','qt_l_min'):near(two['hemodynamics'][key],one['hemodynamics'][key]*scale)
    near(two['hemodynamics']['k2_mmhg_min2_l2'],one['hemodynamics']['k2_mmhg_min2_l2']/scale**2)
    near(two['hemodynamics']['driving_pressure_mmhg'],one['hemodynamics']['driving_pressure_mmhg'])
    near(two['oxygen']['metrics']['sa_fraction'],one['oxygen']['metrics']['sa_fraction'])

    # Hb varies without hidden viscosity/flow coupling and with fixed PHYSICAL consumption.
    c=changed(base,dp=-.45)
    c['oxygen']={'mode':'physical','spv_fraction':.99,'hb_g_dl':12,
                 'kappa_ml_o2_g_hb':1.34,'vo2_ml_min':30.552}
    one=solve(c);c['oxygen']['hb_g_dl']=14;two=solve(c)
    near(one['hemodynamics']['qs_l_min'],two['hemodynamics']['qs_l_min'])
    near(one['oxygen']['metrics']['pulmonary_net_add_ml_min'],30.552)
    near(two['oxygen']['metrics']['pulmonary_net_add_ml_min'],30.552)
    assert two['oxygen']['metrics']['normalized_consumption_l_min'] < one['oxygen']['metrics']['normalized_consumption_l_min']
    d0=one['oxygen']['metrics']['do2_ml_min'];d1=two['oxygen']['metrics']['do2_ml_min']
    components=math.log(14/12)+math.log(two['oxygen']['metrics']['sa_fraction']/one['oxygen']['metrics']['sa_fraction'])
    near(math.log(d1/d0),components)
    assert not math.isclose(d1/d0,two['oxygen']['metrics']['delivery_index_l_min']/one['oxygen']['metrics']['delivery_index_l_min'])

    bad=[]
    for key,val in [('alpha',1.1),('alpha',-1),('alpha',True),('nonlinear_fraction',1.01)]:
        c=example();c['response'][key]=val;bad.append(c)
    c=example();c['reference']['pv_mmhg']=3;bad.append(c)
    c=example();c['perturbation']['rs_multiplier']=0;bad.append(c)
    c=example();c['oxygen']['hb_g_dl']=14;bad.append(c)
    c=example();c['perturbation']['scope']='whole_pathway_audit';bad.append(c)
    c=example();c['oxygen']['normalized_consumption_l_min']=float('nan');bad.append(c)
    for c in bad:
        try:validate(c)
        except ValueError:pass
        else:raise AssertionError('Invalid config was accepted')
    return {
      'status':'passed','executed_utc':datetime.now(timezone.utc).isoformat(),
      'python':sys.version.split()[0],'scope':'Reference numerical pipeline only; not production/browser/clinical validation.',
      'golden_cases':len(fixtures['cases']),'golden_metric_comparisons':metrics,
      'seed':SEED,'randomized_parameter_states':n,'randomized_admissible_states':feasible,
      'independent_decimal_random_state_checks':oracle_cases,
      'table3_rounded_comparisons':table3_checks,
      'table1_ratio_and_delivery_comparisons':10,
      'table1_remaining_column_discrepancies':extra_t1_discrepancies,
      'max_pressure_residual_mmhg':max_pressure,'max_flow_residual_l_min':max_flow,
      'max_output_law_log_residual':max_law,
      'invalid_configuration_cases_rejected':len(bad),
      'fixture_sha256':hashlib.sha256((HERE/'savorgnan_golden_cases.json').read_bytes()).hexdigest(),
      'author_code_audit':'not_performed_code_not_retrieved',
      'rendered_source_figure_audit':'not_performed_rendering_unavailable',
      'ahmed_full_text_replication':'inherited_blocked_source_unavailable',
      'app_browser_tests':'not_implemented_not_run',
    }


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    report=verify()
    text=json.dumps(report,indent=2,allow_nan=False)+'\n'
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(text)
    print(text,end='')

if __name__=='__main__':main()
