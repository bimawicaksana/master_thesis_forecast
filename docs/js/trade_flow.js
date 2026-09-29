/* Read-only presentation of preserved research outputs; no model execution or inferred results. */
(() => {
  "use strict";
  const el=id=>document.getElementById(id);
  const num=v=>v==null||String(v).trim()===""||!Number.isFinite(Number(v)) ? null : Number(v);
  const fmt=(v,d=3,suffix="")=>num(v)===null ? "Not reported" : Number(v).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d})+suffix;
  const escape=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const names={
    pooled:"Pooled",product_fe:"Product FE",origin_destination_fe:"Origin / Destination FE",
    adjusted_r2:"Adjusted R²",pseudo_r2:"McFadden pseudo-R²",rmse:"RMSE",mae:"MAE",mape:"MAPE",bias:"Bias",extreme_share:"Extreme Share",
    in_sample:"In-sample",reported_test_dataset:"Reported test dataset",
    saved_notebook_output:"Reported model results",defended_thesis_reported:"Thesis-reported metrics",
    log_trade_tonnes:"Log trade volume (tonnes)",trade_tonnes_level:"Trade volume in tonnes (level)",model_fit:"Model fit",
    log_maritime_trade_volume_tonnes:"Log maritime trade volume (tonnes)",FE_dummy:"Fixed effect",structural:"Structural term"
  };
  const human=v=>names[v]||String(v||"Not reported").replaceAll("_"," ");
  const specOrder=["pooled","product_fe","origin_destination_fe"];
  const ordered=rows=>[...rows].sort((a,b)=>specOrder.indexOf(a.specification)-specOrder.indexOf(b.specification));
  const unique=(rows,key)=>[...new Set(rows.map(r=>r[key]))];
  const config={responsive:true,displaylogo:false};
  const layout=()=>({font:{family:"Arial, sans-serif",size:12,color:"#222"},paper_bgcolor:"#fff",plot_bgcolor:"#fff",margin:{l:85,r:25,t:25,b:95},hovermode:"closest"});
  const isPercent=metric=>["mape","extreme_share"].includes(metric);
  // Source percentage metrics are displayed as supplied, without multiplying by 100.
  const metricValue=r=>num(r.value)!==null&&Number(r.value)!==0&&Math.abs(Number(r.value))<0.005&&r.metric==="bias"
    ? Number(r.value).toExponential(3)
    : fmt(r.value,["adjusted_r2","pseudo_r2"].includes(r.metric)?3:2,isPercent(r.metric)?"%":"");
  const pValue=v=>num(v)===null ? "Not reported" : Number(v)!==0&&Math.abs(Number(v))<0.0001 ? Number(v).toExponential(3) : fmt(v,4);
  function fail(id,detail) {
    console.error("Trade-flow "+id+":",detail);
    const message=el(id+"-status");
    message.textContent="Trade-flow data could not be loaded for this section. Please refresh the page or check the data source.";
    message.classList.add("tf-error");message.setAttribute("role","alert");
  }
  function load(file,required) {
    return new Promise((resolve,reject)=>{
      if(!window.Papa||!window.Plotly||!window.jQuery?.fn?.DataTable) {
        reject(new Error("A required CDN dependency is unavailable."));return;
      }
      Papa.parse("data/"+file,{
        download:true,header:true,skipEmptyLines:"greedy",
        complete(result) {
          if(result.errors.length||!result.data.length||!required.every(k=>result.meta.fields?.includes(k))) {
            reject(new Error(file+": empty CSV, missing columns or parse errors: "+JSON.stringify(result.errors)));return;
          }
          resolve(result.data);
        },error:reject
      });
    });
  }
  function paragraph(parent,text,className="tf-metadata") {
    const p=document.createElement("p");p.className=className;p.textContent=text;parent.append(p);
  }
  function badge(parent,text) {
    const span=document.createElement("span");span.className="tf-badge";span.textContent=text;parent.append(span);
  }
  function metadata(rows) {
    return "Scope: "+unique(rows,"evaluation_scope").map(human).join("; ")+
      ". Scale: "+unique(rows,"scale").map(human).join("; ")+
      ". Values are shown at reported precision.";
  }
  function dataTable(id,rows,columns,order=[]) {
    return jQuery("#"+id).DataTable({
      data:rows,columns,pageLength:25,scrollX:true,deferRender:true,searching:true,ordering:true,paging:true,order
    });
  }
  function column(key,title,render) {
    return {data:key,title,defaultContent:"",render(value,type,row) {
      if(render) return render(value,type,row);
      return type==="display" ? escape(value) : value;
    }};
  }
  const textColumn=(key,title)=>column(key,title,(v,type)=>type==="display"?escape(human(v)):human(v));
  const numericColumn=(key,title,digits)=>column(key,title,(v,type)=>
    type==="sort"||type==="type" ? num(v) : key==="p_value" ? pValue(v) : fmt(v,digits));
  async function econometrics(sourceRows) {
    // Suppress the duplicated PPML adjusted-R² field if it ever appears; never relabel it.
    const rows=sourceRows.filter(r=>!(r.model_family==="PPML"&&r.metric==="adjusted_r2"));
    dataTable("metrics-table",rows,[
      column("model_family","Model Family"),textColumn("specification","Specification"),textColumn("metric","Metric"),
      column("value","Value",(v,type,row)=>type==="sort"||type==="type"?num(v):metricValue(row)),
      textColumn("scale","Scale"),textColumn("evaluation_scope","Evaluation Scope"),textColumn("provenance","Result basis")
    ]);
    const ols=ordered(rows.filter(r=>r.model_family==="OLS"&&r.metric==="adjusted_r2"));
    el("ols-metadata").textContent=ols.length?metadata(ols):"OLS adjusted-R² values are not reported.";
    await Plotly.react("ols-chart",[{
      type:"bar",x:ols.map(r=>human(r.specification)),y:ols.map(r=>num(r.value)),marker:{color:"#1f4e79"},
      customdata:ols.map(r=>[escape(human(r.evaluation_scope)),escape(human(r.provenance))]),
      hovertemplate:"Specification: %{x}<br>Adjusted R²: %{y:.3f}<br>Evaluation Scope: %{customdata[0]}<br>Result basis: %{customdata[1]}<extra></extra>"
    }],{...layout(),xaxis:{automargin:true},yaxis:{title:{text:"Adjusted R² — log trade volume"},automargin:true}},config);
    const ppml=rows.filter(r=>r.model_family==="PPML");
    el("ppml-fit-cards").replaceChildren(...ordered(ppml.filter(r=>r.metric==="pseudo_r2")).map(row=>{
      const card=document.createElement("article");card.className="tf-panel";
      const h=document.createElement("h4");h.textContent=human(row.specification);card.append(h);
      paragraph(card,"McFadden pseudo-R²");
      paragraph(card,metricValue(row),"tf-fit-value");
      badge(card,human(row.evaluation_scope));paragraph(card,human(row.provenance));return card;
    }));
    const select=el("ppml-metric");
    async function update() {
      const shown=ordered(ppml.filter(r=>r.metric===select.value));
      el("ppml-metadata").textContent=shown.length?metadata(shown):"This metric was not reported.";
      await Plotly.react("ppml-chart",[{
        type:"bar",x:shown.map(r=>human(r.specification)),y:shown.map(r=>num(r.value)),marker:{color:"#277f80"},
        customdata:shown.map(r=>[metricValue(r),escape(human(r.scale)),escape(human(r.evaluation_scope)),escape(human(r.provenance))]),
        hovertemplate:"Specification: %{x}<br>"+human(select.value)+": %{customdata[0]}<br>Scale: %{customdata[1]}<br>Evaluation Scope: %{customdata[2]}<br>Result basis: %{customdata[3]}<extra></extra>"
      }],{...layout(),xaxis:{automargin:true},
        yaxis:{title:{text:human(select.value)+(isPercent(select.value)?" (%)":" (tonnes)")},automargin:true}},config);
    }
    await update();select.disabled=false;
    select.addEventListener("change",()=>update().catch(e=>fail("metrics",e)));
  }
  async function coefficients(rows) {
    const family=el("tf-family"),spec=el("tf-specification"),terms=el("tf-term-type");
    const grid=dataTable("tf-coefficient-table",[],[
      column("model_family","Model Family"),textColumn("specification","Specification"),column("term","Term"),
      numericColumn("coefficient","Coefficient",6),numericColumn("std_error","Standard Error",6),numericColumn("p_value","p-value",4),
      // Preserve the significance field exactly, including empty source labels.
      column("significance","Significance"),textColumn("term_type","Term Type")
    ]);
    async function update() {
      const modelRows=rows.filter(r=>r.model_family===family.value&&r.specification===spec.value);
      const shown=modelRows.filter(r=>terms.value==="all"||r.term_type===(terms.value==="fixed_effect"?"FE_dummy":"structural"));
      grid.clear().rows.add(shown).draw();
      el("coefficient-count").textContent=fmt(shown.length,0)+" of "+fmt(modelRows.length,0)+" coefficients shown for this specification. "+
        (terms.value==="structural"?"Structural terms only on the chart.":"Table-only display for this selection; no fixed effects are omitted from the table.");
      el("coefficient-metadata").textContent="Scope: "+unique(modelRows,"evaluation_scope").map(human).join("; ")+
        ". Target scale: "+unique(modelRows,"target_scale").map(human).join("; ")+". Reported model coefficients.";
      el("coefficient-chart-panel").hidden=terms.value!=="structural";
      if(terms.value!=="structural") return;
      el("tf-coefficient-chart").style.height=Math.max(450,shown.length*27+85)+"px";
      await Plotly.react("tf-coefficient-chart",[{
        type:"bar",orientation:"h",x:shown.map(r=>num(r.coefficient)),y:shown.map(r=>r.term),marker:{color:"#1f4e79"},
        customdata:shown.map(r=>[fmt(r.coefficient,6),fmt(r.std_error,6),pValue(r.p_value),escape(r.significance),escape(r.model_family),escape(human(r.specification))]),
        hovertemplate:"Term: %{y}<br>Coefficient: %{customdata[0]}<br>Standard Error: %{customdata[1]}<br>p-value: %{customdata[2]}<br>Significance: %{customdata[3]}<br>Model: %{customdata[4]}<br>Specification: %{customdata[5]}<extra></extra>"
      }],{...layout(),height:Math.max(450,shown.length*27+85),margin:{l:190,r:25,t:20,b:60},
        xaxis:{title:{text:"Coefficient"},automargin:true},
        yaxis:{type:"category",autorange:"reversed",automargin:true,tickfont:{size:10}},
        shapes:[{type:"line",xref:"x",yref:"paper",x0:0,x1:0,y0:0,y1:1,line:{color:"#65758a",width:1,dash:"dash"}}]
      },config);
    }
    await update();
    for(const select of [family,spec,terms]) {
      select.disabled=false;select.addEventListener("change",()=>update().catch(e=>fail("coefficients",e)));
    }
  }
  function ann(rows) {
    el("ann-metrics").replaceChildren(...rows.map(row=>{
      const card=document.createElement("article");card.className="tf-panel";
      const h=document.createElement("h3");h.textContent=row.model;card.append(h);
      badge(card,human(row.evaluation_scope));badge(card,human(row.provenance));
      paragraph(card,"Evaluation scope: "+human(row.evaluation_scope)+". Scale: "+human(row.scale)+". Target: "+human(row.target)+".");
      const metrics=document.createElement("dl");metrics.className="tf-metrics";
      for(const [key,label,digits,suffix] of [
        ["r2","R²",4,""],["rmse","RMSE",4,""],["mae","MAE",4,""],["mape","MAPE",2,"%"],
        ["extreme_errors","Extreme Errors",0,""],["extreme_share","Extreme Share",2,"%"]
      ]) {
        const item=document.createElement("div"),term=document.createElement("dt"),value=document.createElement("dd");
        term.textContent=label;value.textContent=fmt(row[key],digits,suffix);item.append(term,value);metrics.append(item);
      }
      card.append(metrics);return card;
    }));
  }
  // Independent load/render boundaries. No prediction artifact is requested.
  [
    ["metrics","trade_flow_econometric_metrics.csv",["model_family","specification","metric","value","scale","evaluation_scope","provenance","provenance_note"],econometrics],
    ["coefficients","trade_flow_econometric_coefficients.csv",["model_family","specification","term","coefficient","std_error","p_value","significance","term_type","evaluation_scope","target_scale"],coefficients],
    ["ann","trade_flow_ml_metrics.csv",["model","r2","rmse","mae","mape","extreme_errors","extreme_share","evaluation_scope","scale","target","provenance","provenance_note"],ann]
  ].forEach(([id,file,required,render])=>{
    load(file,required).then(render).then(()=>{el(id+"-status").textContent="";el(id+"-status").dataset.loaded="true";})
      .catch(e=>fail(id,e));
  });
})();
