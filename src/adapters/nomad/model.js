export const profiles = { nomad:'Nomad', expat:'Expat', local:'Local', family:'Family' };
export const metrics = [
  ['overall_score','Overall score','score'],
  ['cost_for_nomad_usd_per_month','Nomad / month','money'],
  ['cost_for_expat_usd_per_month','Expat / month','money'],
  ['cost_for_local_usd_per_month','Local / month','money'],
  ['cost_for_family_usd_per_month','Family / month','money'],
  ['rent_1br_center_usd_per_month','1-bedroom central rent','money'],
  ['coworking_usd_per_month','Coworking / month','money'],
  ['internet_mbps','Internet','speed'],
  ['safety_score_0_to_5','Safety','score'],
  ['walkability_score_0_to_5','Walkability','score'],
  ['healthcare_score_0_to_5','Healthcare','score'],
  ['cleanliness_score_0_to_5','Cleanliness','score'],
  ['fun_score_0_to_5','Fun','score'],
  ['nightlife_score_0_to_5','Nightlife','score'],
  ['english_speaking_score_0_to_5','English speaking','score'],
  ['female_friendly_score_0_to_5','Female friendliness','score'],
  ['lgbt_friendly_score_0_to_5','LGBTQ+ friendliness','score'],
  ['temperature_c_now','Temperature at collection','temperature'],
  ['humidity_now','Humidity at collection','percent'],
  ['air_quality_now','Air quality index at collection','number'],
  ['population','Population','number'],
  ['has_remote_work_visa','Remote work visa reported','boolean']
];
export const defaults = { q:'', region:'', country:'', profile:'nomad', budget:'', internet:'', safety:'', walkability:'', healthcare:'', english:'', female:'', lgbt:'', nightlife:'', cleanliness:'', tempMin:'', tempMax:'', air:'', visa:false, sort:'overall_score', view:'cards' };
export const known = x => typeof x === 'number' && Number.isFinite(x);
export const costKey = profile => `cost_for_${Object.hasOwn(profiles,profile) ? profile : 'nomad'}_usd_per_month`;
export const fold = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function format(value, type='number') {
  if (value === null || value === undefined || (typeof value === 'number' && !known(value))) return 'Not available';
  if (type==='boolean') return value === true ? 'Yes' : 'Not reported';
  if (type==='money') return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  if (type==='score') return `${Number(value).toFixed(1)} / 5`;
  if (type==='temperature') return `${value}°C`;
  if (type==='speed') return `${value} Mbps`;
  if (type==='percent') return `${value}%`;
  return Number(value).toLocaleString('en-US');
}
export function selectCities(cities, filters) {
  const f={...defaults,...filters};
  const minimums={internet:'internet_mbps',safety:'safety_score_0_to_5',walkability:'walkability_score_0_to_5',healthcare:'healthcare_score_0_to_5',english:'english_speaking_score_0_to_5',female:'female_friendly_score_0_to_5',lgbt:'lgbt_friendly_score_0_to_5',nightlife:'nightlife_score_0_to_5',cleanliness:'cleanliness_score_0_to_5',tempMin:'temperature_c_now'};
  const maximums={budget:costKey(f.profile),tempMax:'temperature_c_now',air:'air_quality_now'};
  const selected=cities.filter(c=> {
    if (c.region==='Space') return false;
    if (f.q && !fold(`${c.name} ${c.country}`).includes(fold(f.q.trim()))) return false;
    if (f.region && c.region!==f.region) return false;
    if (f.country && c.country!==f.country) return false;
    if (f.visa && c.has_remote_work_visa!==true) return false;
    for (const [k,field] of Object.entries(minimums)) if (f[k]!=='' && (!known(c[field]) || c[field]<Number(f[k]))) return false;
    for (const [k,field] of Object.entries(maximums)) if (f[k]!=='' && !(k==='budget'&&Number(f[k])>=15000) && (!known(c[field]) || c[field]>Number(f[k]))) return false;
    return true;
  });
  const key=f.sort==='cost' ? costKey(f.profile) : f.sort;
  const direction=['cost','air_quality_now'].includes(f.sort) ? 1 : -1;
  return selected.sort((a,b)=> {
    if (!known(a[key])) return known(b[key]) ? 1 : a.name.localeCompare(b.name);
    if (!known(b[key])) return -1;
    return (a[key]-b[key])*direction || a.name.localeCompare(b.name);
  });
}
export function median(values) {
  const v=values.filter(known).sort((a,b)=>a-b),n=v.length;
  return n ? (n%2 ? v[(n-1)/2] : (v[n/2-1]+v[n/2])/2) : null;
}
export function toCSV(rows) {
  if (!rows.length) return '';
  const fields=Object.keys(rows[0]);
  const cell=value=> {
    let s=value==null ? '' : String(value);
    if (typeof value==='string' && /^[=+@-]/.test(s)) s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  };
  return [fields.map(cell).join(','),...rows.map(r=>fields.map(k=>cell(r[k])).join(','))].join('\r\n');
}
