import json, random, statistics, math
from pathlib import Path
report_path = Path('reports/solver-next-20260909/holdout-final.json')
r = json.loads(report_path.read_text(encoding='utf-8'))
trials = {(t['caseId'],t['repeat'],t['variant']):t for t in r['trials']}
board_keys = {c['id']:tuple(v % 10 if v >= 0 else -1 for row in c['board'] for v in row) for c in r['cases']}
clusters = {}
for p in r['pairs']:
    clusters.setdefault(board_keys[p['caseId']],[]).append(p)
groups = list(clusters.values())
def quantile(xs,p):
    return sorted(xs)[max(0, math.ceil(p*len(xs))-1)]
def metrics(pairs):
    a=[trials[(p['caseId'],p['repeat'],'baseline')] for p in pairs]
    b=[trials[(p['caseId'],p['repeat'],'candidate')] for p in pairs]
    av=[v['elapsedCoreMs'] for v in a]; bv=[v['elapsedCoreMs'] for v in b]
    success=lambda t:any(s.get('allRequirementsSuccess',False) for s in t['nativeTop10'])
    steps=[p['meanStepDeltaAtSameQuality'] for p in pairs if p['meanStepDeltaAtSameQuality'] is not None]
    return {
      'median_latency_reduction_fraction':(quantile(av,.5)-quantile(bv,.5))/quantile(av,.5),
      'p95_latency_reduction_fraction':(quantile(av,.95)-quantile(bv,.95))/quantile(av,.95),
      'all_requirements_success_rate_delta':sum(success(y)-success(x) for x,y in zip(a,b))/len(a),
      'net_quality_win_rate':sum(1 if p['qualityWinnerReturned']=='candidate' else -1 if p['qualityWinnerReturned']=='baseline' else 0 for p in pairs)/len(pairs),
      'mean_step_delta_per_pair':statistics.mean(steps) if steps else None,
    }
observed=metrics(r['pairs']); values={k:[] for k in observed}
rng=random.Random(539364199)
for _ in range(5000):
    sample=[p for _ in groups for p in groups[rng.randrange(len(groups))]]
    for k,v in metrics(sample).items():
        if v is not None: values[k].append(v)
out={'method':'Paired percentile bootstrap clustered by underlying color board; scenarios/repeats stay together',
     'seed':539364199,'resamples':5000,'independent_boards':len(groups),'trial_pairs':len(r['pairs']),
     'source_report':str(report_path),'sourceMetadata':r['sourceMetadata'],
     'metrics':{k:{'observed':v,'ci95':[quantile(values[k],.025),quantile(values[k],.975)] if values[k] else None} for k,v in observed.items()},
     'limitations':['Conditional on this suite/device; not a cross-device guarantee.','Group steps use each trial-pair mean, not treating every signature as independent.','No assertion that all individual cases improved, and no promotion gate is implied.']}
Path('reports/solver-next-20260909/cluster-bootstrap.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'independent_boards':len(groups),'metrics':out['metrics']}))
