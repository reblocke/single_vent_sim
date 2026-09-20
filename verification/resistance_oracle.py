"""Test-only high-precision pressure-root oracle, independent of the float solver.

It does not import resistance_reference. Do not call this from production code.
"""
from decimal import Decimal as D, localcontext


def oracle(config):
    with localcontext() as context:
        context.prec = 60
        cv=lambda v:D(str(v))
        b=config['reference']; r=config['response']; p=config['perturbation']; o=config['oxygen']
        rs0=cv(b['rs_mmhg_min_l']); rp0=cv(b['rp_mmhg_min_l'])
        sh0=cv(b['rshunt_nominal_mmhg_min_l']); qt0=cv(b['qt_l_min'])
        alpha=cv(r['alpha']); f=cv(r['nonlinear_fraction'])
        ref_load=1/(1/rs0+1/(rp0+sh0)); dp0=qt0*ref_load
        qcal=qt0*rs0/(rs0+rp0+sh0)
        rs=rs0*cv(p['rs_multiplier']); rp=rp0*cv(p['rp_multiplier'])
        sh=sh0*cv(p['rshunt_multiplier'])
        if p['scope']=='whole_pathway_audit': sh*=cv(p['rp_multiplier'])
        k1=(1-f)*sh; k2=f*sh/qcal
        ra=1/(1/rs+1/(rp+sh))
        desired=qt0*(ref_load/ra)**alpha
        def flows(dp):
            qs=dp/rs
            a=rp+k1
            qp=dp/a if k2==0 else ((a*a+4*k2*dp).sqrt()-a)/(2*k2)
            return qp,qs
        def residual(dp):
            qp,qs=flows(dp); total=qp+qs
            if r['closure']=='nominal_parallel': return total-desired
            return (1-alpha)*(total/qt0).ln()+alpha*(dp/dp0).ln()
        lo,hi=dp0/2,dp0*2
        for _ in range(200):
            if residual(lo)<=0<=residual(hi): break
            if residual(lo)>0: lo/=2
            if residual(hi)<0: hi*=2
        else: raise AssertionError('Oracle failed to bracket')
        for _ in range(200):
            mid=(lo+hi)/2
            if residual(mid)>0: hi=mid
            else: lo=mid
        dp=(lo+hi)/2
        qp,qs=flows(dp); qt=qp+qs
        spv=cv(o['spv_fraction'])
        B=cv(o['hb_g_dl'])*cv(o['kappa_ml_o2_g_hb']) if o['mode']=='physical' else None
        k=cv(o['vo2_ml_min'])/(10*B) if B is not None else cv(o['normalized_consumption_l_min'])
        sv=spv-k/qp-k/qs
        sa=(qp*spv+qs*sv)/qt  # independent mixed-return formulation
        index=qs*sa
        vals={
            'qp_l_min':qp,'qs_l_min':qs,'qt_l_min':qt,'r':qp/qs,
            'driving_pressure_mmhg':dp,
            'arterial_pressure_mmhg':dp+cv(b['common_downstream_pressure_mmhg']),
            'nominal_afterload_mmhg_min_l':ra,
            'circuit_secant_afterload_mmhg_min_l':dp/qt,
            'k1_mmhg_min_l':k1,'k2_mmhg_min2_l2':k2,
            'calibration_qp_l_min':qcal,
            'shunt_secant_resistance_mmhg_min_l':k1+k2*qp,
            'shunt_incremental_resistance_mmhg_min_l':k1+2*k2*qp,
            'sa_fraction':sa,'sv_fraction':sv,'delivery_index_l_min':index,
            'normalized_consumption_l_min':k,
            'normalized_systemic_out_l_min':qs*sv,
            'normalized_pulmonary_in_l_min':qp*sa,
            'normalized_pulmonary_out_l_min':qp*spv,
            'normalized_pulmonary_net_l_min':k,
            'normalized_systemic_net_l_min':k,
            'normalized_zero_venous_limit_l_min':spv*qp*qs/qt,
            'oer_fraction':k/index if index else None,
            'omega':index/k if k else None,
            'capacity_ml_dl':B,
            'cpv_ml_dl':B*spv if B is not None else None,
            'ca_ml_dl':B*sa if B is not None else None,
            'cv_ml_dl':B*sv if B is not None else None,
            'vo2_ml_min':10*B*k if B is not None else None,
            'do2_ml_min':10*B*index if B is not None else None,
            'systemic_out_ml_min':10*B*qs*sv if B is not None else None,
            'pulmonary_in_ml_min':10*B*qp*sa if B is not None else None,
            'pulmonary_out_ml_min':10*B*qp*spv if B is not None else None,
            'pulmonary_net_add_ml_min':10*B*k if B is not None else None,
            'systemic_net_use_ml_min':10*B*k if B is not None else None,
        }
        eps=D('1e-12')*max(D(1),abs(sa),abs(sv))
        status=('infeasible_requested_consumption' if sv < -eps else
                'degenerate_zero_oxygen' if k==0 and spv==0 else
                'zero_venous_boundary' if abs(sv)<=eps else 'admissible')
        return {name:float(value) if value is not None else None for name,value in vals.items()},status
