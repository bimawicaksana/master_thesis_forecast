/* Presentation only. Authoritative CSV values are never recomputed or overwritten. */
(() => {
  'use strict';
  const el = id => document.getElementById('fc-' + id);
  const names = {black_sea:'Black Sea Conflict', el_nino:'El Niño', eu_ets:'EU Emissions Trading System'};
  const productNames = {'1001':'Wheat','1005':'Maize','1006':'Rice'};
  const state = {scenario:'black_sea', data:{}, corridorIndex:new Map(), corridorLoading:false, table:null};
  const errorMessage = 'Forecast data could not be loaded for this section. Please refresh the page or check the data source.';
  const number = v => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  const fmt = (v,d=2) => number(v) === null ? 'Not reported' : Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct = v => number(v) === null ? 'Not reported' : (Number(v)>0?'+':'') + fmt(v) + '%';
  const tonnes = v => number(v) === null ? 'Not reported' : new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(Number(v))+' t';
  const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parseArray = v => { const a=JSON.parse(v); if(!Array.isArray(a)) throw new Error('Expected scope array'); return a.map(String); };
  const focusNames = a => a.map(c=>(productNames[c]||c)+' ('+c+')').join(' / ');
  const meta = () => state.data.metadata?.find(r=>r.scenario_id===state.scenario);
  const selected = key => state.data[key]?.filter(r=>r.scenario_id===state.scenario).slice().sort((a,b)=>Number(a.year)-Number(b.year));
  const configured = r => String(r.configured_pair).toLowerCase()==='true';
  const options = {responsive:true,displaylogo:false};
  const layout = () => ({font:{family:'Arial, sans-serif',size:12},margin:{l:70,r:20,t:45,b:65},paper_bgcolor:'#fff',plot_bgcolor:'#fff',legend:{orientation:'h',y:1.15},hovermode:'closest'});
  function status(section,text,error=false) {
    const p=el(section+'-status');p.textContent=text;p.classList.toggle('fc-error',error);p.setAttribute('role',error?'alert':'status');
  }
  function fail(section,error) { console.error('Forecast '+section+':',error);status(section,errorMessage,true); }
  async function guard(section,fn) { try { await fn(); } catch(e) { fail(section,e); } }
  function load(file,fields,numeric=[],large=false) {
    return new Promise((resolve,reject)=>{
      if(!window.Papa) { reject(new Error('PapaParse CDN unavailable')); return; }
      // A Blob worker has no document-relative base: resolve the relative data path
      // against this page, retaining compatibility with any GitHub Pages subpath.
      Papa.parse(new URL('data/'+file,document.baseURI).href,{
        download:true,header:true,skipEmptyLines:'greedy',worker:large && Papa.WORKERS_SUPPORTED,
        complete(result) {
          // Papa's worker can send completion without a result after an HTTP error.
          if(!result || !Array.isArray(result.data)) {reject(new Error(file+': no parsed result'));return;}
          if(result.errors.length || !result.data.length || !fields.every(k=>result.meta.fields?.includes(k))) {
            reject(new Error(file+': empty data, missing columns or parse errors '+JSON.stringify(result.errors)));return;
          }
          if(result.data.some(r=>numeric.some(k=>number(r[k])===null))) {reject(new Error(file+': invalid numeric field'));return;}
          resolve(result.data);
        },error:reject
      });
    });
  }
  function cards(id,items) {
    el(id).replaceChildren(...items.map(([label,value])=>{
      const box=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=label;dd.textContent=value;box.append(dt,dd);return box;
    }));
  }
  function simpleTable(id,rows) {
    el(id).querySelector('tbody').replaceChildren(...rows.map(values=>{
      const tr=document.createElement('tr');
      values.forEach(value=>{ const td=document.createElement('td');td.textContent=value;tr.append(td); });return tr;
    }));
  }
  function shockMap(text) {
    // Demand metadata can contain a JSON map followed by an implementation caveat.
    const end=text.indexOf('}');
    if(end<0) return text;
    const map=JSON.parse(text.slice(0,end+1));
    const values=Object.entries(map).map(([country,value])=>country+' '+pct(Number(value)*100));
    return (values.length?values.join('; '):'None configured')+text.slice(end+1).replace('because apply_demand_to_calorific_proxy=false','(calorific demand proxy disabled)');
  }
  function renderMetadata() {
    if(!state.data.metadata) return;
    const r=meta();if(!r) throw new Error('Missing scenario assumptions');
    const types={geopolitical_stress:'Geopolitical stress',climate_stress:'Climate stress',regulatory_freight_stress:'Regulatory freight stress'};
    const origins=r.focus_origins.startsWith('[')?parseArray(r.focus_origins).join(' / '):r.focus_origins;
    cards('overview',[
      ['Scenario Type',types[r.scenario_type]||r.scenario_type.replaceAll('_',' ')],['Forecast Years',r.years],['Focus Origins',origins],
      ['Dashboard Product Scope',focusNames(parseArray(r.dashboard_product_scope))],['Configured Corridors',fmt(r.corridor_count,0)],['Baseline Volume Coverage',fmt(r.baseline_volume_coverage_pct)+'%']
    ]);
    cards('shocks',[['Freight',pct(Number(r.freight_shock)*100)],['Connectivity',pct(Number(r.connectivity_shock)*100)],['Distance',pct(Number(r.distance_shock)*100)],['Production',shockMap(r.production_shock_summary)],['Demand',shockMap(r.demand_shock_summary)]]);
    const publicCaveats={
      black_sea:'The Black Sea case covers 16 selected corridors, with a wheat/maize display focus. Transport shocks apply across represented products on those pairs. The EGY −8% parameter affects destination production, not calorific demand.',
      el_nino:'This case follows the thesis results-table assumptions: ARG production −10%, AUS −8%, connectivity −5%, freight +20% and distance +5%. Methodology text also describes logistics as broadly intact. Both descriptions are noted here; transport shocks apply beyond the wheat/maize display focus.',
      eu_ets:'The thesis focuses on wheat, maize and rice; corridor selection uses wheat and maize. The transport shock applies to all eight represented cereal products on selected corridors. Display focus does not change this scope.'
    };
    el('caveat').textContent=publicCaveats[state.scenario];
    el('interpretation').textContent='Conditional changes relative to the scenario baseline; not probabilistic forecasts of realized outcomes.';
    status('metadata',r.display_label+' · Conditional stress test');
  }
  async function indexPlot(id,rows,value,delta,ytitle,baselineName) {
    if(!window.Plotly) throw new Error('Plotly CDN unavailable');
    await Plotly.react(el(id),[
      {type:'scatter',mode:'lines',x:rows.map(r=>Number(r.year)),y:rows.map(()=>100),name:baselineName,line:{dash:'dash',color:'#777'},hovertemplate:'Year %{x}<br>Baseline = 100<extra></extra>'},
      {type:'scatter',mode:'lines+markers',x:rows.map(r=>Number(r.year)),y:rows.map(r=>Number(r[value])),customdata:rows.map(r=>Number(r[delta])),name:names[state.scenario],hovertemplate:'Year %{x}<br>Baseline = 100<br>Scenario Index: %{y:.2f}<br>Change: %{customdata:+.2f}%<extra></extra>'}
    ],{...layout(),xaxis:{title:'Year',dtick:1},yaxis:{title:ytitle+'<br>Baseline = 100',tickformat:'.2f'}},options);
  }
  async function renderTrade() {
    const rows=selected('trade');if(!rows) return;if(!rows.length) throw new Error('Missing scenario trade series');
    simpleTable('trade-table',rows.map(r=>[r.year,fmt(r.scenario_trade_index),pct(r.delta_trade_pct)]));
    simpleTable('tonnes-table',rows.map(r=>[r.year,fmt(r.baseline_trade_tons,3)+' t',fmt(r.scenario_trade_tons,3)+' t']));
    el('trade-coverage').textContent='Annual totals cover the forecast panel, including records with incomplete country identifiers. Country-level matching is not required for annual summation.';
    await indexPlot('trade-chart',rows,'scenario_trade_index','delta_trade_pct','Trade Volume Index','Baseline Index = 100');
    status('trade',names[state.scenario]+' · 2025–2030 · Same-year baseline comparison');
  }
  async function renderProducts() {
    const source=selected('products');if(!source) return;
    const rows=source.filter(r=>r.year===el('product-year').value).sort((a,b)=>a.product_code.localeCompare(b.product_code));
    if(!rows.length) throw new Error('Missing product/year data');
    const r=meta(),focus=r?parseArray(r.dashboard_product_scope):[];
    el('focus').textContent=r?'Declared dashboard focus: '+focusNames(focus):'Focus metadata unavailable; all products remain visible.';
    if(!window.Plotly) throw new Error('Plotly CDN unavailable');
    await Plotly.react(el('products-chart'),[{
      type:'bar',x:rows.map(r=>r.product_label),y:rows.map(r=>Number(r.delta_trade_pct)),
      marker:{color:rows.map(r=>focus.includes(r.product_code)?'#1f77b4':'rgba(31,119,180,0.15)'),line:{color:'#1f77b4',width:1.5}},
      customdata:rows.map(r=>[r.product_code,Number(r.baseline_trade_tons),Number(r.scenario_trade_tons),Number(r.scenario_trade_index),focus.includes(r.product_code)?'Dashboard focus':'Other represented product']),
      hovertemplate:'%{x} (%{customdata[0]})<br>%{customdata[4]}<br>Baseline: %{customdata[1]:,.3f} t<br>Scenario: %{customdata[2]:,.3f} t<br>Scenario Index: %{customdata[3]:.2f}<br>Trade Change: %{y:+.2f}%<extra></extra>'
    }],{...layout(),margin:{l:65,r:20,t:20,b:160},xaxis:{tickvals:rows.map(r=>r.product_label),ticktext:rows.map(r=>escape(r.product_label).replace(/; /g,';<br>').replace(' and canary seeds','<br>and canary seeds')),tickangle:-30},yaxis:{title:'Trade Change vs Baseline (%)',zeroline:true,zerolinewidth:2,zerolinecolor:'#777'},shapes:[{type:'line',xref:'paper',x0:0,x1:1,y0:0,y1:0,line:{color:'#777',width:1}}]},options);
    status('products',names[state.scenario]+' · '+el('product-year').value+' · All '+rows.length+' products shown');
  }
  async function renderCost() {
    const rows=selected('cost');if(!rows) return;if(!rows.length) throw new Error('Missing scenario cost series');
    el('cost-scope').textContent='Product scope: '+focusNames(parseArray(rows[0].product_scope))+'. '+rows[0].scope_note;
    simpleTable('cost-table',rows.map(r=>[r.year,fmt(r.baseline_mean_cost_per_ton),fmt(r.scenario_mean_cost_per_ton),fmt(r.cost_index),pct(r.delta_cost_pct)]));
    await indexPlot('cost-chart',rows,'cost_index','delta_cost_pct','Transport Cost Index','Baseline Cost Index = 100');
    status('cost',names[state.scenario]+' · Scoped Transport Cost Index');
  }
  function renderContext() {
    const rows=state.data.context;if(!rows) return;
    // Deliberately isolated: no access to scenario rows, joins or interpolation.
    cards('baseline-context',rows.map(r=>[r.metric.replace('baseline_','').replace('_approx','')+' · Thesis-reported context','≈'+fmt(Number(r.value)/1000000,0)+' million tonnes']));
    status('context','Separate thesis-reported context · Not used in scenario indices');
  }
  async function renderCorridors() {
    if(!state.data.corridors) return;
    const key=state.scenario+'|'+el('corridor-year').value;
    const all=state.corridorIndex.get(key)||[];
    const rows=el('configured-only').checked?all.filter(configured):all.slice();
    // Coverage is read from the generated dataset, not inferred from the aggregate row count.
    const coverage=all[0]?.valid_key_coverage||'Coverage not reported';
    const counts=coverage.match(/^(\d+)\/(\d+) rows per source; (\d+) excluded/);
    el('corridor-coverage').textContent=counts
      ? 'Corridor comparisons use '+fmt(counts[1],0)+' complete, unique source identities per scenario. '+fmt(counts[3],0)+' rows with incomplete country keys are excluded from observation-level pairing. These records are retained in annual/product sums where country identity is not required.'
      : coverage;
    const top=rows.filter(r=>Number(r.trade_change_pct_mean)<0).sort((a,b)=>Number(a.trade_change_pct_mean)-Number(b.trade_change_pct_mean)).slice(0,10);
    el('ranking-note').textContent=top.length?'Showing '+top.length+' negative corridor changes.':'No negative mean trade changes in this selection.';
    if(!window.jQuery?.fn?.DataTable) throw new Error('DataTables CDN unavailable');
    const columns=[['year','Year'],['origin_label','Origin'],['destination_label','Destination'],['configured_pair','Configured Pair'],['product_observation_count','Product Observations'],['baseline_trade_tons','Baseline Trade Tons'],['scenario_trade_tons','Scenario Trade Tons'],['trade_change_pct_mean','Mean Trade Change %'],['aggregate_trade_delta_pct','Aggregate Trade Delta %'],['cost_change_pct_mean','Mean Cost Change %']].map(([data,title])=>({data,title,render(v,type,row){
      if(data==='configured_pair') return type==='display'?(configured(row)?'Yes':'No'):(configured(row)?1:0);
      if(data.endsWith('_label')) return type==='display'?escape(v)+' ('+escape(row[data.replace('_label','_isocode')])+')':v;
      if(type==='sort'||type==='type') return number(v);
      if(data.endsWith('_tons')) return type==='display'?'<span title="'+escape(fmt(v,3)+' tonnes')+'">'+tonnes(v)+'</span>':v;
      return data==='year'||data==='product_observation_count'?fmt(v,0):pct(v);
    }}));
    if(state.table) state.table.clear().rows.add(rows).draw();
    else state.table=jQuery('#fc-corridor-table').DataTable({data:rows,columns,pageLength:25,scrollX:true,deferRender:true,searching:true,ordering:true,paging:true,order:[[7,'asc']]});
    state.table.columns.adjust();
    if(!window.Plotly) throw new Error('Plotly CDN unavailable');
    await Plotly.react(el('corridor-chart'),[{
      type:'bar',orientation:'h',x:top.map(r=>Number(r.trade_change_pct_mean)),y:top.map(r=>r.origin_isocode+' → '+r.destination_isocode),
      customdata:top.map(r=>[escape(r.origin_label),escape(r.destination_label),Number(r.aggregate_trade_delta_pct),Number(r.cost_change_pct_mean),Number(r.baseline_trade_tons),Number(r.scenario_trade_tons),configured(r)?'Yes':'No']),
      hovertemplate:'%{customdata[0]} → %{customdata[1]}<br>Mean Trade Change: %{x:+.2f}%<br>Aggregate Trade Delta: %{customdata[2]:+.2f}%<br>Mean Cost Change: %{customdata[3]:+.2f}%<br>Baseline: %{customdata[4]:,.3f} t<br>Scenario: %{customdata[5]:,.3f} t<br>Configured Pair: %{customdata[6]}<extra></extra>'
    }],{...layout(),margin:{l:100,r:25,t:20,b:65},xaxis:{title:'Mean Trade Change (%)',zeroline:true},yaxis:{autorange:'reversed',automargin:true}},options);
    status('corridors',names[state.scenario]+' · '+el('corridor-year').value+' · '+fmt(rows.length,0)+' corridor records');
  }
  async function loadCorridors() {
    if(state.corridorLoading||state.data.corridors) return;
    state.corridorLoading=true;el('load-corridors').disabled=true;
    status('corridors','Downloading and parsing 32.2 MB of corridor data… Other sections remain available.');
    try {
      const numeric=['year','product_observation_count','baseline_trade_tons','scenario_trade_tons','trade_change_pct_mean','aggregate_trade_delta_pct','cost_change_pct_mean'];
      const rows=await load('forecast_scenario_corridors.csv',['scenario_id','origin_isocode','destination_isocode','origin_label','destination_label','configured_pair','valid_key_coverage',...numeric],numeric,true);
      rows.forEach(r=>{const k=r.scenario_id+'|'+r.year;if(!state.corridorIndex.has(k))state.corridorIndex.set(k,[]);state.corridorIndex.get(k).push(r);});
      state.data.corridors=rows;
      el('corridor-content').hidden=false;el('load-corridors').hidden=true;
      await renderCorridors();
    } catch(e) {
      fail('corridors',e);
      if(!state.data.corridors) {el('load-corridors').disabled=false;el('load-corridors').textContent='Retry Corridor Analysis';}
    } finally {state.corridorLoading=false;}
  }
  function changeScenario(value) {
    state.scenario=value;el('scenario').value=value;el('corridor-scenario').value=value;
    guard('metadata',renderMetadata);guard('trade',renderTrade);guard('products',renderProducts);guard('cost',renderCost);guard('corridors',renderCorridors);
  }
  el('scenario').addEventListener('change',e=>changeScenario(e.target.value));
  el('corridor-scenario').addEventListener('change',e=>changeScenario(e.target.value));
  el('product-year').addEventListener('change',()=>guard('products',renderProducts));
  el('corridor-year').addEventListener('change',()=>guard('corridors',renderCorridors));
  el('configured-only').addEventListener('change',()=>guard('corridors',renderCorridors));
  el('load-corridors').addEventListener('click',loadCorridors);
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.table)state.table.columns.adjust();},150);});

  const specs=[
    ['metadata','forecast_scenario_assumptions.csv',['scenario_id','display_label','scenario_type','years','focus_origins','dashboard_product_scope','production_shock_summary','demand_shock_summary','scope_caveat','interpretation_note'],['corridor_count','baseline_volume_coverage_pct','freight_shock','connectivity_shock','distance_shock'],renderMetadata],
    ['trade','forecast_scenario_timeseries.csv',['scenario_id','coverage_note'],['year','baseline_trade_tons','scenario_trade_tons','scenario_trade_index','delta_trade_pct'],renderTrade],
    ['products','forecast_scenario_products.csv',['scenario_id','product_code','product_label'],['year','baseline_trade_tons','scenario_trade_tons','scenario_trade_index','delta_trade_pct'],renderProducts],
    ['cost','forecast_scenario_cost_index.csv',['scenario_id','product_scope','scope_note'],['year','baseline_mean_cost_per_ton','scenario_mean_cost_per_ton','cost_index','delta_cost_pct'],renderCost],
    ['context','forecast_baseline_context.csv',['metric','unit','source','provenance_note'],['value'],renderContext]
  ];
  // Independent promises: a failed dataset never prevents another section rendering.
  specs.forEach(([key,file,fields,numeric,render])=>guard(key,async()=>{
    state.data[key]=await load(file,[...fields,...numeric],numeric);
    if(key==='metadata') {
      for(const id of ['scenario','corridor-scenario']) {
        el(id).replaceChildren(...Object.keys(names).map(sid=>new Option(state.data.metadata.find(r=>r.scenario_id===sid)?.display_label||names[sid],sid)));
        el(id).value=state.scenario;
      }
    }
    await render();
    if(key==='metadata') await guard('products',renderProducts);
  }));
})();
