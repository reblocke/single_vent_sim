#!/usr/bin/env python3
"""Reproduce specification reference checks, tables, grids and a labeled ensemble.

Standard library only. This is NOT the browser application or the authors' code.
Run from any working directory; output must be new or empty. Never use Python -O.
"""
from __future__ import annotations
import argparse
from copy import deepcopy
import csv
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import random
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'verification'))
from resistance_reference import PROFILES, VERSION, baseline, changed, compare, example, solve


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def write_rows(path, rows):
    it = iter(rows)
    first = next(it, None)
    if first is None:
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(first))
        writer.writeheader()
        writer.writerow(first)
        count = 1
        for row in it:
            writer.writerow(row)
            count += 1
    return count


def check_references(out):
    """Legacy checkers write beside themselves; execute copies to keep inputs immutable."""
    with tempfile.TemporaryDirectory(prefix='parallel-o2-verification-') as tmp:
        d = Path(tmp) / 'verification'
        shutil.copytree(ROOT / 'verification', d, ignore=shutil.ignore_patterns('__pycache__'))
        for script, result in [('check_golden.py', 'checks_run.json'),
                               ('check_ahmed_extension.py', 'ahmed_checks_run.json')]:
            process = subprocess.run([sys.executable, str(d / script)], check=True,
                                     text=True, capture_output=True, timeout=180)
            (out / (script + '.log')).write_text(process.stdout, encoding='utf-8')
            shutil.copy2(d / result, out / result)
    subprocess.run([sys.executable, str(ROOT / 'verification/check_resistance_extension.py'),
                    '--output', str(out / 'resistance_checks.json')], check=True, timeout=180)


def make_tables(out):
    source = json.loads((ROOT / 'verification/savorgnan_source_claims.json').read_text())
    rows1, rows3, ablation, effects = [], [], [], []
    for pid, label, ds, dp in PROFILES:
        reported1 = next(row for row in source['table1'] if row['profile_id'] == pid)
        reported3 = next(row for row in source['table3'] if row['profile_id'] == pid)
        for scope in ('native_rp', 'whole_pathway_audit'):
            c = changed(example(), ds=ds, dp=dp, alpha=0, fraction=0, scope=scope)
            result = compare(c)
            values = {**result['perturbed']['hemodynamics'], **result['perturbed']['oxygen']['metrics'],
                      'delta_delivery_percent': result['delta_percent']}
            for metric in ('qs_l_min', 'qp_l_min', 'r', 'sa_fraction', 'sv_fraction',
                           'delivery_index_l_min', 'delta_delivery_percent'):
                precision = 2 if metric in ('qs_l_min', 'qp_l_min', 'r') else (1 if metric == 'delta_delivery_percent' else 3)
                diff = values[metric] - reported1[metric]
                rows1.append({'profile_id': pid, 'source_label': label, 'source_table': '1',
                              'reconstruction_scope': scope, 'metric': metric,
                              'source_reported': reported1[metric], 'computed': values[metric],
                              'computed_minus_reported': diff,
                              'within_reported_rounding': abs(diff) <= .5*10**(-precision)+1e-10})
        for closure in ('nominal_parallel', 'circuit_secant'):
            c = changed(example(), ds=ds, dp=dp, closure=closure)
            result = compare(c)
            vals = {**result['perturbed']['hemodynamics'], 'delta_delivery_percent': result['delta_percent']}
            for metric in ('qt_l_min', 'qs_l_min', 'qp_l_min', 'r', 'delta_delivery_percent'):
                diff = vals[metric] - reported3[metric]
                rows3.append({'profile_id': pid, 'source_label': label, 'source_table': '3',
                              'closure': closure, 'metric': metric, 'source_reported': reported3[metric],
                              'computed': vals[metric], 'computed_minus_reported': diff,
                              'within_reported_rounding': abs(diff) <= (.05 if metric == 'delta_delivery_percent' else .0005)+1e-10,
                              'interpretation': 'table-compatible inferred reconstruction' if closure == 'nominal_parallel' else 'new structural sensitivity, not source replication'})
            corners = {}
            for alpha, f in ((0, 0), (.35, 0), (0, .5), (.35, .5)):
                z = compare(changed(c, ds=ds, dp=dp, alpha=alpha, fraction=f))
                corners[alpha, f] = z['delta_percent']
                ablation.append({'profile_id': pid, 'source_label': label, 'closure': closure,
                                 'alpha': alpha, 'nonlinear_fraction': f,
                                 'baseline_index': z['baseline']['oxygen']['metrics']['delivery_index_l_min'],
                                 'perturbed_index': z['perturbed']['oxygen']['metrics']['delivery_index_l_min'],
                                 'delta_percent': z['delta_percent'], 'scope': 'native_rp'})
            dump(out / f'ablation_{pid}_{closure}.json', {
                'scope': 'native_rp', 'closure': closure, 'percent_changes_same_reference': [
                    {'alpha': a, 'fraction': f, 'value': v} for (a, f), v in corners.items()],
                'interaction_percentage_points': corners[.35, .5]-corners[.35, 0]-corners[0, .5]+corners[0, 0],
                'definition': 'D11-D10-D01+D00; not the entire difference between published Tables 1 and 3'})
            for i in range(126):
                t = i / 100
                z = compare(changed(c, ds=ds, dp=dp, effect_scale=t))
                effects.append({'profile_id': pid, 'source_label': label, 'closure': closure,
                                'effect_multiplier': t, 'rs_multiplier': 1+t*ds,
                                'native_rp_multiplier': 1+t*dp, 'delta_percent': z['delta_percent'],
                                'oxygen_status': z['perturbed']['oxygen']['status'],
                                'qt_l_min': z['perturbed']['hemodynamics']['qt_l_min'],
                                'driving_pressure_mmhg': z['perturbed']['hemodynamics']['driving_pressure_mmhg']})
    return {'table1_rows': write_rows(out / 'table1_source_comparisons.csv', rows1),
            'table3_rows': write_rows(out / 'table3_source_comparisons.csv', rows3),
            'ablation_rows': write_rows(out / 'mechanism_ablation.csv', ablation),
            'effect_curve_rows': write_rows(out / 'effect_scale_curves.csv', effects)}


def delta(a, b):
    metric = 'do2_ml_min' if b['oxygen']['physical_do2_available'] else 'delivery_index_l_min'
    if any(s['oxygen']['status'] != 'admissible' for s in (a, b)):
        return None
    v0, v1 = a['oxygen']['metrics'][metric], b['oxygen']['metrics'][metric]
    return 100*(v1/v0-1) if v0 and v0 > 0 else None


def grid_rows(scene, n):
    """Cell-center coordinate array includes both endpoints; CSV is y-major then x-major."""
    default = example()
    domains = {
        'R1': ('rs_multiplier', .5, 1.25, 'native_rp_multiplier', .1, 1.5),
        'R2': ('native_reference_share', 0, 1, 'native_rp_multiplier', .1, 1.5),
        'R3': ('alpha', 0, 1, 'nonlinear_fraction', 0, 1),
        'R4': ('current_rp_mmhg_min_l', 1, 40, 'current_rshunt_nominal_mmhg_min_l', 1, 60),
        'R5': ('hb_g_dl', 6, 20, 'rs_multiplier', .5, 1.25),
        'R6': ('alpha', 0, 1, 'nonlinear_fraction', 0, 1),
    }
    xid, lo, hi, yid, bottom, top = domains[scene]
    for j in range(n):
        y = bottom + (top-bottom)*j/(n-1)
        for i in range(n):
            x = lo + (hi-lo)*i/(n-1)
            c = deepcopy(default)
            if scene == 'R1':
                c['perturbation'].update(rs_multiplier=x, rp_multiplier=y)
            elif scene == 'R2':
                c['reference'].update(rp_mmhg_min_l=40*x, rshunt_nominal_mmhg_min_l=40*(1-x))
                c['perturbation']['rp_multiplier'] = y
            elif scene in ('R3', 'R6'):
                c['response'].update(alpha=x, nonlinear_fraction=y)
                c['perturbation']['rp_multiplier'] = .55
            elif scene == 'R4':
                c['perturbation'].update(rp_multiplier=x/12, rshunt_multiplier=y/28)
            elif scene == 'R5':
                c['oxygen'] = {'mode': 'physical', 'spv_fraction': .99, 'hb_g_dl': x,
                               'kappa_ml_o2_g_hb': 1.34, 'vo2_ml_min': 30.552}
                c['perturbation']['rs_multiplier'] = y
            a, b = solve(baseline(c)), solve(c)
            local_delta = other_delta = difference = None
            if scene == 'R4':
                cc = deepcopy(c)
                cc['perturbation']['rp_multiplier'] *= .55
                local_delta = delta(b, solve(cc))
            if scene == 'R6':
                cc = deepcopy(c)
                cc['response']['closure'] = 'circuit_secant'
                other_delta = compare(cc)['delta_percent']
                here = delta(a, b)
                difference = other_delta-here if here is not None and other_delta is not None else None
            h, o = b['hemodynamics'], b['oxygen']['metrics']
            ha = a['hemodynamics']
            yield {'scene': scene, 'x_index': i, 'y_index': j, 'x_parameter': xid, 'x_value': x,
                   'y_parameter': yid, 'y_value': y, 'oxygen_status': b['oxygen']['status'],
                   'qp_l_min': h['qp_l_min'], 'qs_l_min': h['qs_l_min'], 'qt_l_min': h['qt_l_min'],
                   'r': h['r'], 'driving_pressure_mmhg': h['driving_pressure_mmhg'],
                   'delta_qp_percent': 100*(h['qp_l_min']/ha['qp_l_min']-1),
                   'delta_qs_percent': 100*(h['qs_l_min']/ha['qs_l_min']-1),
                   'delta_qt_percent': 100*(h['qt_l_min']/ha['qt_l_min']-1),
                   'delta_driving_pressure_percent': 100*(h['driving_pressure_mmhg']/ha['driving_pressure_mmhg']-1),
                   'sa_fraction': o['sa_fraction'], 'sv_fraction': o['sv_fraction'],
                   'delivery_index_l_min': o['delivery_index_l_min'], 'do2_ml_min': o['do2_ml_min'],
                   'oer_fraction': o['oer_fraction'], 'omega': o['omega'],
                   'normalized_pulmonary_net_l_min': o['normalized_pulmonary_net_l_min'],
                   'pulmonary_net_add_ml_min': o['pulmonary_net_add_ml_min'],
                   'delta_delivery_percent': delta(a, b), 'local_native_rp_reduction_delta_percent': local_delta,
                   'circuit_secant_delta_percent': other_delta, 'closure_difference_percentage_points': difference}


def make_grids(out, n):
    summaries = []
    for scene in ('R1', 'R2', 'R3', 'R4', 'R5', 'R6'):
        rows = list(grid_rows(scene, n))
        count = write_rows(out / f'{scene}.csv', rows)
        assert count == n*n
        assert [(r['x_index'], r['y_index']) for r in rows] == [(i, j) for j in range(n) for i in range(n)]
        if scene == 'R2':
            # Rp0=0: changing native Rp alone has exactly no consequence.
            assert max(abs(r['delta_delivery_percent']) for r in rows if r['x_index'] == 0) < 1e-9
        metadata = {'scene': scene, 'resolution': [n, n], 'row_order': 'y_major_then_x',
                    'x_parameter': rows[0]['x_parameter'], 'y_parameter': rows[0]['y_parameter'],
                    'baseline_configuration': example(), 'flow_model_version': VERSION,
                    'source_status': 'Assumption-labeled new surfaces, not digitized source figures',
                    'oxygen_infeasible_cells': sum(r['oxygen_status'] == 'infeasible_requested_consumption' for r in rows),
                    'baseline_policy': 'Matched reference circuits at fixed total pulmonary resistance 40' if scene == 'R2' else 'Frozen original reference',
                    'definition_document': 'docs/08_SAVORGNAN_RESISTANCE_EXTENSION.md',
                    'x_range': [rows[0]['x_value'], rows[n-1]['x_value']],
                    'y_range': [rows[0]['y_value'], rows[-1]['y_value']],
                    'notes': 'R4 local delta compares each cell with its own Rp×0.55 state while retaining the original global output-law anchor. R5 physical VO2=30.552 and kappa=1.34; Hb has no hemodynamic feedback. R6 delta is circuit-secant minus nominal closure in percentage points.'}
        dump(out / f'{scene}.json', metadata)
        summaries.append(metadata)
    return summaries


def quantile(x, p):
    if not x:
        return None
    ordered = sorted(x)
    k = (len(ordered)-1)*p
    i = int(k)
    return ordered[i] + (ordered[min(i+1, len(ordered)-1)]-ordered[i])*(k-i)


def draw_ensemble(n, seed):
    rng = random.Random(seed)
    for i in range(n):
        yield {'draw_id': i, 'qt0_l_min': rng.uniform(1.8, 2.2),
               'native_reference_share': rng.uniform(.1, .9),
               'systemic_effect_multiplier': rng.uniform(.75, 1.25),
               'pulmonary_effect_multiplier': rng.uniform(.75, 1.25)}


def make_ensemble(out, n, seed, replay=None):
    if replay:
        with replay.open(newline='') as f:
            draws = [{k: int(v) if k == 'draw_id' else float(v) for k, v in r.items()} for r in csv.DictReader(f)]
        if not draws or len(draws) > 100000:
            raise ValueError('Replay file must contain 1–100000 rows')
        expected = {'draw_id','qt0_l_min','native_reference_share','systemic_effect_multiplier','pulmonary_effect_multiplier'}
        for row in draws:
            if set(row) != expected or not all(math.isfinite(v) for v in row.values()):
                raise ValueError('Malformed replay schema')
            if not (row['qt0_l_min'] > 0 and 0 <= row['native_reference_share'] <= 1 and
                    row['systemic_effect_multiplier'] >= 0 and row['pulmonary_effect_multiplier'] >= 0):
                raise ValueError('Replay values outside domain')
        if len({row['draw_id'] for row in draws}) != len(draws) or any(row['draw_id'] < 0 for row in draws):
            raise ValueError('Replay draw IDs must be unique nonnegative integers')
        n = len(draws)
    else:
        draws = list(draw_ensemble(n, seed))
    write_rows(out / 'draws.csv', draws)
    definitions = {'ensemble_version': 'declared-demonstration-v1', 'seed': seed if not replay else None,
                   'draw_count': n, 'sampling': 'Independent uniform distributions; app choices, NOT recovered paper distributions.',
                   'qt0_l_min': [1.8, 2.2], 'native_reference_share': [.1, .9],
                   'systemic_effect_multiplier': [.75, 1.25], 'pulmonary_effect_multiplier': [.75, 1.25],
                   'fixed': {'rs0': 40, 'total_pulmonary_nominal_r0': 40, 'spv': .99, 'normalized_consumption': .19},
                   'pairing': 'Same four draws across all five profiles and four alpha/f mechanisms; baseline solved within each draw.',
                   'source_monte_carlo_replication': 'blocked_exact_sampling_laws_and_seed_unverified',
                   'inference': 'Fractions and quantiles describe only this chosen ensemble, not clinical event probabilities.',
                   'replay': bool(replay), 'rng': 'Python random.Random; exported draws are authoritative for cross-version replay'}
    dump(out / 'ensemble_definition.json', definitions)
    stats = {}
    def rows():
        for row in draws:
            c0 = example()
            rho = row['native_reference_share']
            c0['reference'].update(qt_l_min=row['qt0_l_min'], rp_mmhg_min_l=40*rho,
                                   rshunt_nominal_mmhg_min_l=40*(1-rho))
            for pid, _label, ds, dp in PROFILES:
                for variant, a, f in (('fixed_linear', 0, 0), ('response_only', .35, 0),
                                      ('nonlinear_only', 0, .5), ('both_nominal', .35, .5)):
                    key = pid, variant
                    cell = stats.setdefault(key, {'valid': [], 'infeasible': 0, 'numerical': 0, 'invalid': 0})
                    c = changed(c0, ds=ds*row['systemic_effect_multiplier'],
                                dp=dp*row['pulmonary_effect_multiplier'], alpha=a, fraction=f)
                    try:
                        value = compare(c)
                        status = 'eligible' if value['eligible_pair'] else 'oxygen_infeasible'
                        delta_value = value['delta_percent']
                        if status == 'eligible': cell['valid'].append(delta_value)
                        else: cell['infeasible'] += 1
                    except ValueError:
                        status, delta_value = 'invalid_configuration', None
                        cell['invalid'] += 1
                    except (ArithmeticError, OverflowError):
                        status, delta_value = 'numerical_failure', None
                        cell['numerical'] += 1
                    yield {'draw_id': row['draw_id'], 'profile_id': pid, 'variant': variant,
                           'pair_status': status, 'delta_delivery_percent': delta_value}
    count = write_rows(out / 'paired_results.csv', rows())
    summary = []
    for (pid, variant), record in stats.items():
        valid = record['valid']; nv = len(valid); neg = sum(v < 0 for v in valid)
        frac = neg/nv if nv else None
        unresolved = n-nv
        assert nv + record['infeasible'] + record['numerical'] + record['invalid'] == n
        summary.append({'profile_id': pid, 'variant': variant, 'requested': n, 'eligible': nv,
                        'oxygen_infeasible': record['infeasible'], 'numerical_failure': record['numerical'],
                        'invalid_configuration': record['invalid'], 'mean_delta_percent': statistics.fmean(valid) if nv else None,
                        'q025_delta_percent': quantile(valid, .025), 'q50_delta_percent': quantile(valid, .5),
                        'q975_delta_percent': quantile(valid, .975), 'fraction_negative_among_eligible': frac,
                        'monte_carlo_se_fraction': math.sqrt(frac*(1-frac)/nv) if nv else None,
                        'negative_fraction_lower_all_requested': neg/n,
                        'negative_fraction_upper_unclassified': (neg+unresolved)/n,
                        'interpretation': 'Assumed-ensemble sensitivity, not clinical probability; quantiles not confidence intervals'})
    write_rows(out / 'summary.csv', summary)
    return {'draws': n, 'paired_evaluations': count, 'summaries': len(summary),
            'draw_sha256': hashlib.sha256((out / 'draws.csv').read_bytes()).hexdigest(),
            'source_replication': 'not_claimed', 'replay': bool(replay)}


def run(args):
    if not __debug__:
        raise RuntimeError('Assertions must remain enabled; do not use Python -O')
    n = 41 if args.quick else args.grid_n
    mc_n = 2000 if args.quick else args.mc_n
    if not (3 <= n <= 401 and 1 <= mc_n <= 100000):
        raise ValueError('grid-n must be 3–401 and mc-n 1–100000')
    out = args.output.resolve()
    if out.exists() and any(out.iterdir()):
        raise ValueError('Output must be absent or empty; no overwrite is performed')
    protected = [ROOT / d for d in ('verification', 'config', 'docs', 'schemas', 'scripts')]
    if out == ROOT or any(out == p or p in out.parents for p in protected):
        raise ValueError('Refusing output into authoritative inputs/code')
    out.mkdir(parents=True, exist_ok=True)
    start = time.monotonic()
    checks = out / 'checks'; checks.mkdir()
    check_references(checks)
    tables = make_tables(out / 'tables')
    grids = make_grids(out / 'grids', n)
    ensemble = make_ensemble(out / 'ensemble', mc_n, args.seed, args.replay_draws)
    report = {'pipeline_version': 'reference-pipeline-v1.2', 'specification_version': '1.2.0-spec',
              'status': 'passed', 'executed_utc': datetime.now(timezone.utc).isoformat(),
              'python': sys.version.split()[0], 'elapsed_seconds': time.monotonic()-start,
              'scientific_scope': 'Independent reconstruction/reference pipeline. NOT completed application or clinical validation.',
              'flow_provider_contract': VERSION,
              'oxygen_core_contract': 'barnea-parallel-bound-o2-v1',
              'input_code_sha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in sorted(list((ROOT / 'verification').glob('*.py')) + [Path(__file__).resolve()] +
                    [ROOT / 'verification' / x for x in ('golden_cases.json', 'ahmed_golden_cases.json',
                       'savorgnan_golden_cases.json', 'savorgnan_source_claims.json')])},
              'tables': tables, 'grid_count': len(grids), 'grid_resolution': [n, n],
              'grid_rows': len(grids)*n*n, 'ensemble': ensemble,
              'preserved_original_checks': ['Barnea reference arithmetic', 'Ahmed-derived reference arithmetic'],
              'author_code_audit': 'not_performed', 'rendered_source_figures': 'not_verified',
              'ahmed_full_text_reproduction': 'blocked_source_unavailable',
              'source_mc_reproduction': 'blocked_sampling_laws_unverified',
              'production_browser_app': 'not_implemented_not_tested', 'remote_deployment': 'not_performed'}
    dump(out / 'pipeline_report.json', report)
    (out / 'README.md').write_text(
        '# Reference pipeline output\n\n'
        'These are computed numerical reference artifacts, not the implemented interactive app or author-code outputs.\n\n'
        f'Run: {report["executed_utc"]}; Python {report["python"]}. Six grids at {n}×{n}; '
        f'{ensemble["draws"]:,} independent draws reused in {ensemble["paired_evaluations"]:,} paired evaluations.\n\n'
        '- `checks/`: separately executed Barnea, Ahmed-derived and resistance numerical checks.\n'
        '- `tables/`: original source values alongside reconstruction values; mechanism ablation; effect-size curves.\n'
        '- `grids/`: six y-major numerical grids and explicit metadata. Empty CSV metric fields are null, not zero.\n'
        '- `ensemble/`: declared assumptions, exact sampled inputs for replay, paired results and conditional summaries.\n\n'
        'No display color scale, image, or browser interaction is tested here. See the application tickets for those gates. '
        'The source sampling distributions, rendered figures and executable author code were not audited.\n', encoding='utf-8')
    hashes = {str(p.relative_to(out)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted(out.rglob('*')) if p.is_file() and p.name != 'output_manifest.json'}
    dump(out / 'output_manifest.json', {'hash_algorithm': 'sha256', 'files': hashes,
         'deterministic_payloads': 'tables, grids and ensemble draws/results; timestamps/timing/check execution dates intentionally vary'})
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--grid-n', type=int, default=201)
    parser.add_argument('--mc-n', type=int, default=20000)
    parser.add_argument('--seed', type=int, default=2026091804)
    parser.add_argument('--replay-draws', type=Path)
    parser.add_argument('--quick', action='store_true', help='41×41 grids and 2000 draws, explicitly reported')
    try:
        run(parser.parse_args())
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as exc:
        raise SystemExit(f'Reference pipeline failed: {exc}') from exc
