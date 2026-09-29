/* Authoritative CSV results are read only. All operations below are presentation only. */
(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const numeric = value => value == null || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);
  const format = (value, digits = 3, suffix = "") => numeric(value) === null ? "Not reported" :
    Number(value).toLocaleString("en-US", {minimumFractionDigits:digits,maximumFractionDigits:digits}) + suffix;
  const escape = value => String(value ?? "").replace(/[&<>"']/g,
    c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const labels = {
    in_sample:"In-sample", held_out_random_test:"Held-out random test",
    in_sample_all_data:"In-sample / all-data fitted",
    defended_thesis_reported:"Thesis-reported results",
    artifact_validated:"Model results",
    reported_not_recovered_from_model_artifact:"Thesis-reported results",
    log_cost_for_r2_rmse_mape:"Log cost for R², RMSE and MAPE",
    level_cost:"Level maritime transport expenditure per ton",
    log:"Log maritime transport expenditure per ton",
    mixed_log_and_level:"Mixed log and level scales",
    maritime_transport_expenditure_per_ton:"Maritime transport expenditure per ton",
    log_maritime_transport_expenditure_per_ton:"Log maritime transport expenditure per ton"
  };
  const human = value => labels[value] || String(value || "Not reported").replaceAll("_"," ");
  const unique = (rows,key) => [...new Set(rows.map(r => r[key]))];
  const config = {responsive:true,displaylogo:false};
  const layout = () => ({
    font:{family:"Arial, sans-serif",color:"#222",size:12},paper_bgcolor:"#fff",plot_bgcolor:"#fff",
    margin:{l:80,r:25,t:25,b:85},hovermode:"closest"
  });
  function fail(id, detail) {
    console.error("Transport-cost " + id + ":",detail);
    const node = el(id + "-status");
    node.textContent = "Transport-cost data could not be loaded for this section. Please refresh the page or check the data source.";
    node.classList.add("tc-error"); node.setAttribute("role","alert");
  }
  function load(filename, required) {
    return new Promise((resolve,reject) => {
      if (!window.Papa || !window.Plotly || !window.jQuery?.fn?.DataTable) {
        reject(new Error("A required CDN dependency is unavailable.")); return;
      }
      Papa.parse("data/" + filename, {
        download:true,header:true,skipEmptyLines:"greedy",
        complete(result) {
          if (result.errors.length || !result.data.length || !required.every(k => result.meta.fields?.includes(k))) {
            reject(new Error(filename + ": missing columns, empty data or parse errors: " + JSON.stringify(result.errors))); return;
          }
          // No dynamic typing: preserve raw source values, including codes and missing fields.
          resolve(result.data);
        },
        error:reject
      });
    });
  }
  function paragraph(parent, text, className = "tc-metadata") {
    const node = document.createElement("p"); node.className = className; node.textContent = text; parent.append(node);
  }
  function modelCards(id,rows,metrics) {
    el(id).replaceChildren(...rows.map(row => {
      const card = document.createElement("article"); card.className = "tc-model-card";
      const heading = document.createElement("h3"); heading.textContent = row.model === "GLM" ? "Gamma GLM" : row.model;
      card.append(heading);
      const badge = document.createElement("span"); badge.className = "tc-badge"; badge.textContent = human(row.evaluation_scope); card.append(badge);
      if (row.provenance) {
        const provenance = document.createElement("span"); provenance.className = "tc-badge";
        provenance.textContent = human(row.provenance); card.append(provenance);
      }
      paragraph(card,"Evaluation scope: " + human(row.evaluation_scope));
      paragraph(card,"Metric scale: " + human(row.metric_scale));
      paragraph(card,"Target: " + human(row.target));
      const list = document.createElement("dl"); list.className = "tc-metrics";
      metrics.forEach(([key,label,digits,suffix]) => {
        const item = document.createElement("div"),term = document.createElement("dt"),value = document.createElement("dd");
        term.textContent = label; value.textContent = format(row[key],digits,suffix || ""); item.append(term,value);list.append(item);
      });
      card.append(list);
      // Internal provenance notes remain in the data, not in public copy.
      const details = document.createElement("details"), summary = document.createElement("summary");
      summary.textContent = "Evaluation details"; details.append(summary);
      ["evaluation_scope","metric_scale","target"].forEach(key => {
        if(row[key]) paragraph(details,key.replaceAll("_"," ") + ": " + human(row[key]));
      });
      card.append(details); return card;
    }));
  }
  function table(id,rows,columns,order) {
    return jQuery("#"+id).DataTable({
      data:rows,columns:columns.map(([key,title,digits,suffix]) => ({
        data:key,title,defaultContent:"",
        render(value,type) {
          if (digits === undefined) {
            const text = key === "provenance" ? human(value) : value;
            return type === "display" ? escape(text) : text;
          }
          if(type === "sort" || type === "type") return numeric(value);
          // Percentages in these five source files are already on the 0–100 scale.
          return format(value,digits,suffix || "");
        }
      })),
      pageLength:25,scrollX:true,deferRender:true,searching:true,ordering:true,paging:true,order
    });
  }
  function pooled(rows) {
    modelCards("pooled-cards",rows,[
      ["r2","R²",3],["rmse","RMSE",4],["mape","MAPE",2,"%"],
      ["extreme_share","Extreme Share",2,"%"],["n_obs","N",0]
    ]);
  }
  async function coefficients(rows) {
    const select=el("coefficient-model");
    select.replaceChildren(...unique(rows,"model").map(model => new Option(model,model)));
    const grid=table("coefficient-table",rows,[
      ["model","Model"],["variable","Variable"],["coefficient","Coefficient",6],
      ["p_value","p-value",3],["provenance","Result basis"]
    ],[]);
    async function update() {
      const shown=rows.filter(r => r.model===select.value);
      grid.clear().rows.add(shown).draw();
      el("coefficient-provenance").textContent = "Scope: " + unique(shown,"evaluation_scope").map(human).join("; ") +
        ". Reported values reproduce the results presented in the defended thesis.";
      await Plotly.react("coefficient-chart",[{
        type:"bar",orientation:"h",x:shown.map(r=>numeric(r.coefficient)),y:shown.map(r=>r.variable),
        marker:{color:"#1f4e79"},
        customdata:shown.map(r=>[escape(r.model),escape(r.variable),format(r.coefficient,6),format(r.p_value,3),escape(human(r.provenance))]),
        hovertemplate:"Model: %{customdata[0]}<br>Variable: %{customdata[1]}<br>Coefficient: %{customdata[2]}<br>p-value: %{customdata[3]}<br>Result basis: %{customdata[4]}<extra></extra>"
      }],{...layout(),margin:{l:135,r:25,t:25,b:65},
        xaxis:{title:{text:"Coefficient"},zeroline:true,zerolinecolor:"#63758a",automargin:true},
        yaxis:{type:"category",autorange:"reversed",automargin:true}
      },config);
    }
    await update(); select.disabled=false;
    select.addEventListener("change",()=>update().catch(e=>fail("coeff",e)));
  }
  async function fixedEffects(rows) {
    const ordered=[...rows].sort((a,b)=>a.commodity.localeCompare(b.commodity,undefined,{numeric:true}));
    el("fe-metadata").textContent = "Evaluation scope: " + unique(rows,"evaluation_scope").map(human).join("; ") +
      ". Scale: " + unique(rows,"target_scale").map(human).join("; ") +
      ". Extreme threshold: " + unique(rows,"extreme_threshold").join("; ") + ". Ordered by commodity code.";
    table("fe-table",ordered,[
      ["commodity","Commodity"],["r2","R²",3],["rmse","RMSE",2],["mape","MAPE",2,"%"],["bias","Bias",2],
      ["extreme_residuals","Extreme Residuals",0],["extreme_share","Extreme Share",2,"%"],["n_obs","N",0]
    ],[[0,"asc"]]);
    await Plotly.react("fe-chart",[{
      type:"bar",x:ordered.map(r=>r.commodity),y:ordered.map(r=>numeric(r.r2)),marker:{color:"#1f4e79"},
      customdata:ordered.map(r=>[format(r.n_obs,0),format(r.rmse,2),format(r.mape,2,"%"),format(r.extreme_share,2,"%")]),
      hovertemplate:"Commodity: %{x}<br>R² (log): %{y:.3f}<br>N: %{customdata[0]}<br>RMSE (level): %{customdata[1]}<br>MAPE (level): %{customdata[2]}<br>Extreme Share (level): %{customdata[3]}<extra></extra>"
    }],{...layout(),xaxis:{title:{text:"Commodity code"},type:"category",automargin:true},
      yaxis:{title:{text:"R² — log target"},automargin:true}},config);
  }
  function machineLearning(rows) {
    modelCards("ml-cards",rows,[
      ["r2","R²",3],["rmse","RMSE",4],["mae","MAE",4],["mape","MAPE",2,"%"],
      ["extreme_errors","Extreme Errors",0],["extreme_share","Extreme Share",2,"%"],["n_obs","N",0]
    ]);
  }
  async function predictions(rows) {
    const year=el("ann-year"),product=el("ann-product"),chart=el("ann-chart");
    for (const [select,key] of [[year,"year"],[product,"product_code"]]) {
      unique(rows,key).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).forEach(v=>select.add(new Option(v,v)));
    }
    el("ann-metadata").textContent = "Evaluation scope: " + unique(rows,"evaluation_scope").map(human).join("; ") +
      ". Target: log maritime transport expenditure per ton.";
    const grid=table("ann-table",rows,[
      ["year","Year"],["origin_isocode","Origin"],["destination_isocode","Destination"],["product_code","Product"],
      ["actual_log_cost_per_ton","Actual Log Cost/Ton",4],["predicted_log_cost_per_ton","Predicted Log Cost/Ton",4]
    ],[[0,"asc"]]);
    const reference=(low,high)=>({type:"line",xref:"x",yref:"y",x0:low,y0:low,x1:high,y1:high,
      layer:"below",line:{color:"#65758a",width:1.5,dash:"dash"}});
    function syncReference() {
      const ranges=[...chart._fullLayout.xaxis.range,...chart._fullLayout.yaxis.range];
      return Plotly.relayout(chart,{shapes:[reference(Math.min(...ranges),Math.max(...ranges))]});
    }
    async function update() {
      const shown=rows.filter(r=>(!year.value||r.year===year.value)&&(!product.value||r.product_code===product.value));
      grid.clear().rows.add(shown).draw();
      const x=shown.map(r=>numeric(r.actual_log_cost_per_ton)),y=shown.map(r=>numeric(r.predicted_log_cost_per_ton));
      let low=Infinity,high=-Infinity,complete=0;
      shown.forEach((r,i)=>{
        if(x[i]!==null&&y[i]!==null) complete++;
        for(const value of [x[i],y[i]]) if(value!==null) {low=Math.min(low,value);high=Math.max(high,value);}
      });
      if(!Number.isFinite(low)) {low=0;high=1;}
      const padding=(high-low||1)*0.06; low-=padding;high+=padding;
      el("ann-count").textContent = format(shown.length,0) + " of " + format(rows.length,0) +
        " fitted observations selected; " + format(complete,0) + " have finite chart coordinates. Model metric cards remain fixed." +
        (!shown.length ? " No observations match these filters." : "");
      await Plotly.react(chart,[{
        type:"scattergl",mode:"markers",x,y,
        marker:{size:4,opacity:0.22,color:"#1f4e79"},
        customdata:shown.map(r=>[escape(r.year),escape(r.origin_isocode),escape(r.destination_isocode),escape(r.product_code)]),
        hovertemplate:"Year: %{customdata[0]}<br>Origin ISO: %{customdata[1]}<br>Destination ISO: %{customdata[2]}<br>Product Code: %{customdata[3]}<br>Actual Log Cost/Ton: %{x:.4f}<br>Predicted Log Cost/Ton: %{y:.4f}<extra></extra>"
      }],{...layout(),margin:{l:80,r:25,t:25,b:90},
        xaxis:{title:{text:"Actual log maritime transport<br>expenditure per ton"},range:[low,high],automargin:true},
        yaxis:{title:{text:"Predicted log maritime transport<br>expenditure per ton"},range:[low,high],scaleanchor:"x",scaleratio:1,automargin:true},
        shapes:[reference(low,high)]
      },config);
      // Equal-axis scaling can expand the visible range during the initial render.
      await syncReference();
    }
    await update();
    // Extend the identity reference when the user zooms, pans or resets axes.
    // This is chart geometry only; no regression or model metric is calculated.
    chart.on("plotly_relayout",event=>{
      if(!Object.keys(event).some(k=>k.startsWith("xaxis.")||k.startsWith("yaxis.")||["autosize","width","height"].includes(k))) return;
      syncReference().catch(e=>fail("ann",e));
    });
    year.disabled=false;product.disabled=false;
    for(const select of [year,product]) select.addEventListener("change",()=>update().catch(e=>fail("ann",e)));
  }
  // Each CSV has its own error boundary; no single load gates the other sections.
  const sources=[
    ["pooled","transport_cost_pooled_metrics.csv",["model","r2","rmse","mape","extreme_share","n_obs","evaluation_scope","target","metric_scale","provenance","provenance_note"],pooled],
    ["coeff","transport_cost_pooled_coefficients.csv",["model","variable","coefficient","p_value","evaluation_scope","target","provenance","validation_status","provenance_note"],coefficients],
    ["fe","transport_cost_fe_metrics.csv",["commodity","r2","rmse","mape","bias","extreme_residuals","extreme_share","n_obs","evaluation_scope","target_scale","extreme_threshold"],fixedEffects],
    ["ml","transport_cost_ml_metrics.csv",["model","r2","rmse","mae","mape","extreme_errors","extreme_share","n_obs","evaluation_scope","target","metric_scale","source_target_variable"],machineLearning],
    ["ann","transport_cost_ann_predictions.csv",["year","origin_isocode","destination_isocode","product_code","actual_log_cost_per_ton","predicted_log_cost_per_ton","evaluation_scope","source_target_variable"],predictions]
  ];
  sources.forEach(([id,file,required,render])=>{
    load(file,required).then(render).then(()=>{el(id+"-status").textContent="";el(id+"-status").dataset.loaded="true";})
      .catch(e=>fail(id,e));
  });
})();
