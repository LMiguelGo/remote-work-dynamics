import csv, sys, statistics as st
def mib(s):
    v=s.split('/')[0].strip()
    n=float(v[:-3]); u=v[-3:]
    return n*1024 if u=='GiB' else n/1024 if u=='KiB' else n
for f in sys.argv[1:]:
    d={}
    for r in csv.DictReader(open(f)):
        d.setdefault(r['name'],[]).append((float(r['cpu'].rstrip('%')), mib(r['mem'])))
    print(f, 'muestras', len(next(iter(d.values()))))
    for k,v in d.items():
        c=[x[0] for x in v]; m=[x[1] for x in v]
        print(f"  {k:12s} CPU mediana {st.median(c):6.1f}%  max {max(c):6.1f}% | MEM mediana {st.median(m):7.1f} MiB max {max(m):7.1f} MiB")
    tot=[sum(x) for x in zip(*[[y[0] for y in v] for v in d.values()])]
    totm=[sum(x) for x in zip(*[[y[1] for y in v] for v in d.values()])]
    print(f"  TOTAL        CPU mediana {st.median(tot):6.1f}%  max {max(tot):6.1f}% | MEM max {max(totm):7.1f} MiB")
