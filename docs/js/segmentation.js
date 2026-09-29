/* Presentation only: never rewrite source records, thresholds, classifications or ranks. */
(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const number = value => value === "" || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const format = (value, digits = 0) => number(value) === null ? "Not available" :
    Number(value).toLocaleString("en-US", {minimumFractionDigits: digits, maximumFractionDigits: digits});
  const escape = value => String(value ?? "").replace(/[&<>"']/g,
    c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const quadrants = ["Q1 — Critical Exposure", "Q2 — High Dependency, Low Cost", "Q3 — High Cost Sensitivity", "Q4 — Low Risk"];
  const colors = ["#b44343", "#cc842a", "#76569c", "#277f80"];
  const config = {responsive:true, displaylogo:false};
  const years = rows => [...new Set(rows.map(r => r.year))].join(", ");
  const baseLayout = () => ({
    font:{family:'Arial, sans-serif',color:"#222",size:12},
    paper_bgcolor:"#fff",plot_bgcolor:"#fff",margin:{l:70,r:25,t:25,b:75},hovermode:"closest"
  });
  function error(section, detail) {
    console.error("Segmentation " + section + ":", detail);
    const message = el(section + "-message");
    message.textContent = "Segmentation data could not be loaded. Please refresh the page or check the data source.";
    message.classList.add("seg-error");
    message.setAttribute("role","alert");
  }
  function load(path, required) {
    return new Promise((resolve,reject) => {
      if (!window.Papa || !window.Plotly || !window.jQuery?.fn?.DataTable) {
        reject(new Error("Required CDN library unavailable")); return;
      }
      Papa.parse(path, {
        download:true,header:true,skipEmptyLines:"greedy",
        complete(result) {
          if (result.errors.length || !result.data.length || !required.every(k => result.meta.fields?.includes(k))) {
            reject(new Error("Empty or invalid CSV: " + JSON.stringify(result.errors))); return;
          }
          // Keep the raw CSV strings intact; numeric conversion happens only when displaying.
          resolve(result.data);
        },
        error:reject
      });
    });
  }
  function kpis(id, entries) {
    el(id).replaceChildren(...entries.map(([label,value]) => {
      const card = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = label; dd.textContent = value; card.append(dt,dd); return card;
    }));
  }
  function table(id, specs, rows, order) {
    return jQuery("#" + id).DataTable({
      data:rows,columns:specs.map(([key,title,digits,percent]) => ({
        title,data:key,defaultContent:"",
        render(value,type) {
          if (digits === undefined) return type === "display" ? escape(value) : value;
          const n = number(value);
          if (type === "sort" || type === "type") return n;
          return n === null ? "Not available" : format(percent ? n*100 : n,digits) + (percent ? "%" : "");
        }
      })),
      order,pageLength:25,searching:true,ordering:true,paging:true,scrollX:true,deferRender:true
    });
  }
  function extent(values, threshold) {
    const valid = values.map(number).filter(v => v !== null);
    if (threshold !== null) valid.push(threshold);
    const low = valid.length ? Math.min(...valid) : 0, high = valid.length ? Math.max(...valid) : 1;
    const pad = (high-low || 1)*0.08;
    return [low-pad,high+pad];
  }
  function threshold(rows, field) {
    const values = [...new Set(rows.map(r => number(r[field])).filter(v => v !== null))];
    if (values.length > 1) throw new Error("Inconsistent stored global threshold: " + field);
    // Missing values are not estimated, in accordance with the research-integrity constraint.
    return values.length ? values[0] : null;
  }
  async function countries(rows) {
    const cost = threshold(rows,"cost_threshold"), gap = threshold(rows,"food_gap_threshold");
    kpis("country-kpis",[
      ["Countries analysed",format(rows.length)],
      ...quadrants.map(q => [q.slice(5),format(rows.filter(r => r.segmentation_quadrant === q).length)]),
      ["Year",years(rows)]
    ]);
    const select = el("region-filter");
    [...new Set(rows.map(r => r.destination_region))].sort().forEach(region => select.add(new Option(region,region)));
    const grid = table("country-table",[
      ["destination_label","Country"],["destination_region","Region"],
      ["food_import_gap_ratio","Food Import Gap Ratio",4],["cost_intensity_country","Cost Intensity",4],
      ["cost_level","Cost Level"],["gap_level","Dependency Level"],["segmentation_quadrant","Segment"]
    ],rows,[[0,"asc"]]);
    // Fit global display bounds to plottable pairs, without excluding any source rows
    // from traces, counts or tables. Keep these bounds fixed across region selections.
    const paired = rows.filter(r => number(r.cost_intensity_country) !== null && number(r.food_import_gap_ratio) !== null);
    const xr = extent(paired.map(r => r.cost_intensity_country),cost), yr = extent(paired.map(r => r.food_import_gap_ratio),gap);
    async function update() {
      const shown = select.value ? rows.filter(r => r.destination_region === select.value) : rows;
      grid.clear().rows.add(shown).draw();
      const plotted = shown.filter(r => number(r.cost_intensity_country) !== null && number(r.food_import_gap_ratio) !== null).length;
      el("country-coverage").textContent = format(shown.length) + " countries selected; " + format(plotted) +
        " have both coordinates. " + format(shown.length-plotted) +
        " remain in the table and counts but cannot be plotted. Countries with either indicator unavailable should not be interpreted as reliably classified; counts retain the reported segment labels. Summary cards cover the full dataset.";
      el("country-thresholds").textContent = "Global " + years(rows) + " thresholds: cost intensity " +
        format(cost,4) + "; food import gap " + format(gap,4) +
        ". These stay fixed for every region." + (cost === null || gap === null ? " A threshold is unavailable; its reference line is not shown." : "");
      const traces = [...new Set(rows.map(r => r.segmentation_quadrant))].sort().map(q => {
        const group = shown.filter(r => r.segmentation_quadrant === q);
        return {
          type:"scatter",mode:"markers",name:q,
          x:group.map(r => number(r.cost_intensity_country)),y:group.map(r => number(r.food_import_gap_ratio)),
          customdata:group.map(r => [escape(r.destination_label),escape(r.destination_region),escape(r.segmentation_quadrant)]),
          marker:{size:10,opacity:0.8,color:colors[quadrants.indexOf(q)] || "#555",line:{width:1,color:"#fff"}},
          hovertemplate:"<b>%{customdata[0]}</b><br>Region: %{customdata[1]}<br>Food Import Gap Ratio: %{y:.4f}<br>Cost Intensity: %{x:.4f}<br>%{customdata[2]}<extra></extra>"
        };
      });
      const shapes = [];
      if (cost !== null) shapes.push({type:"line",xref:"x",yref:"paper",x0:cost,x1:cost,y0:0,y1:1,line:{color:"#63758a",dash:"dash",width:1},layer:"below"});
      if (gap !== null) shapes.push({type:"line",xref:"paper",yref:"y",x0:0,x1:1,y0:gap,y1:gap,line:{color:"#63758a",dash:"dash",width:1},layer:"below"});
      await Plotly.react("country-chart",traces,{
        ...baseLayout(),showlegend:false,
        xaxis:{title:{text:"Cost Intensity"},range:xr,automargin:true},
        yaxis:{title:{text:"Food Import Gap Ratio"},range:yr,automargin:true},shapes
      },config);
    }
    await update(); select.disabled = false;
    select.addEventListener("change",() => update().catch(e => error("country",e)));
    el("country-message").textContent = "";
  }
  const hover = "<b>%{customdata[0]} → %{customdata[1]}</b><br>Opportunity Rank: %{customdata[2]}<br>Opportunity Score: %{customdata[3]:.4f}<br>Maritime Volume: %{customdata[4]:,.2f} tonnes<br>Avg Transport Cost / ton: %{customdata[5]:.2f}<br>LSBCI: %{customdata[6]:.3f}<br>Global Tonnage Rank: %{customdata[7]}<extra></extra>";
  const details = r => [escape(r.origin_label),escape(r.destination_label),number(r.opportunity_rank),number(r.opportunity_score),
    number(r.corridor_seamodes_tons),number(r.avg_transport_cost_per_ton_seamodes),number(r.lsbci),number(r.global_corridor_tonnage_rank)];
  async function corridors(rows) {
    const scores = rows.map(r => number(r.opportunity_score)).filter(v => v !== null);
    kpis("corridor-kpis",[
      ["Corridors analysed",format(rows.length)],
      ["Top corridors highlighted",format(rows.filter(r => String(r.top_corridor).toLowerCase() === "true").length)],
      ["Total maritime volume",format(rows.reduce((sum,r) => sum+(number(r.corridor_seamodes_tons) ?? 0),0)/1e6,2) + " million tonnes"],
      ["Highest opportunity score",format(Math.max(...scores),4)],["Year",years(rows)]
    ]);
    const grid = table("corridor-table",[
      ["opportunity_rank","Opportunity Rank",0],["origin_label","Origin"],["destination_label","Destination"],
      ["corridor_seamodes_kilotons","Maritime Volume (kt)",0],["avg_transport_cost_per_ton_seamodes","Avg Transport Cost / ton",2],
      ["lsbci","LSBCI",3],["opportunity_score","Opportunity Score",4],
      ["perc_of_global_maritime_volume","Global Maritime Share",4,true],["global_corridor_tonnage_rank","Global Tonnage Rank",0]
    ],rows,[[0,"asc"]]);
    const select = el("top-filter");
    async function update() {
      const shown = select.value === "all" ? rows :
        rows.filter(r => number(r.opportunity_rank) !== null && number(r.opportunity_rank) <= Number(select.value));
      // Sort a copy for visual order only; the stored ranks and source rows are unchanged.
      const bars = [...shown].sort((a,b) => Number(b.opportunity_score)-Number(a.opportunity_score));
      grid.clear().rows.add(shown).draw();
      el("corridor-coverage").textContent = format(shown.length) + " corridors selected by reported opportunity rank. Summary cards cover the full dataset.";
      const pageSize = 30, slider = el("bar-window");
      slider.max = String(Math.max(0,bars.length-pageSize)); slider.value = "0";
      slider.disabled = bars.length <= pageSize;
      el("bar-window-control").hidden = bars.length <= pageSize;
      const barLayout = {
        ...baseLayout(),height:Math.max(400,Math.min(pageSize,bars.length)*28+100),
        margin:{l:240,r:25,t:20,b:65},
        xaxis:{title:{text:"Opportunity Score"},automargin:true},
        yaxis:{type:"category",autorange:"reversed",automargin:true,tickfont:{size:10}}
      };
      // Window only the bar presentation to keep thousands of category labels readable.
      // Every selected row is accessible through this slider and remains in the other views.
      async function drawBars() {
        const start = Number(slider.value), visible = bars.slice(start,start+pageSize);
        el("bar-window-label").textContent = "Bar chart view: " + (bars.length ? start+1 : 0) + "–" + Math.min(start+pageSize,bars.length) + " of " + format(bars.length);
        return Plotly.react("corridor-bar",[{
          type:"bar",orientation:"h",x:visible.map(r => number(r.opportunity_score)),
          y:visible.map(r => r.origin_label + " → " + r.destination_label),
          customdata:visible.map(details),hovertemplate:hover,
          marker:{color:visible.map(r => String(r.top_corridor).toLowerCase() === "true" ? "#1f4e79" : "#8199b0")}
        }],barLayout,config);
      }
      slider.oninput = () => drawBars().catch(e => error("corridor",e));
      await Promise.all([
        drawBars(),
        Plotly.react("corridor-scatter",[{
          type:"scatter",mode:"markers",
          x:shown.map(r => number(r.avg_transport_cost_per_ton_seamodes)),
          y:shown.map(r => number(r.corridor_seamodes_kilotons)),
          customdata:shown.map(details),hovertemplate:hover,
          marker:{size:9,opacity:0.7,color:shown.map(r => number(r.opportunity_score)),colorscale:"Viridis",
            cmin:Math.min(...scores),cmax:Math.max(...scores),showscale:true,colorbar:{title:{text:"Score"},thickness:12}}
        }],{
          ...baseLayout(),
          xaxis:{title:{text:"Avg Transport Cost / ton"},automargin:true},
          yaxis:{title:{text:"Maritime Volume (kt)"},automargin:true}
        },config)
      ]);
    }
    await update(); select.disabled = false;
    select.addEventListener("change",() => update().catch(e => error("corridor",e)));
    el("corridor-message").textContent = "";
  }
  // Independent chains: one dataset failing must not prevent the other from working.
  load("data/segmentation_country_2021.csv",["year","destination_label","destination_region","food_import_gap_ratio",
    "cost_intensity_country","cost_level","gap_level","segmentation_quadrant","cost_threshold","food_gap_threshold"])
    .then(countries).catch(e => error("country",e));
  load("data/segmentation_corridor_2021.csv",["year","origin_label","destination_label","corridor_seamodes_tons",
    "corridor_seamodes_kilotons","avg_transport_cost_per_ton_seamodes","lsbci","opportunity_score","opportunity_rank",
    "perc_of_global_maritime_volume","global_corridor_tonnage_rank","top_corridor"])
    .then(corridors).catch(e => error("corridor",e));
})();
