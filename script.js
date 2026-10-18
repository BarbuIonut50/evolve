// =========================================================
//  Should I evolve? - script.js
// =========================================================

// ---------- Settings ----------
const IMAGE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/";

// The six base stats: [column name in the CSV, label on the page]
const STATS = [
  ["hp", "HP"],
  ["attack", "Attack"],
  ["defense", "Defense"],
  ["special_attack", "Sp. Attack"],
  ["special_defense", "Sp. Defense"],
  ["speed", "Speed"],
];

// Texts for the answer
const TITLES = {
  yes: "Yes, evolve it!",
  maybe: "Yes, but think about it",
  no: "No, press B!",
};
const TAGS = {
  yes: "Worth it",
  maybe: "Trade-off",
  no: "Not worth it",
};

// ---------- Loading the data ----------
let pokemon = [];        // every row of the CSV
const typeColors = {};   // the colour the CSV uses for each type, e.g. fire -> #F08030

async function loadData() {
  const response = await fetch("pokemon.csv");
  const text = await response.text();

  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");

  pokemon = lines.slice(1).map(line => {
    const values = line.split(",");
    const row = {};
    headers.forEach((header, i) => {
      const value = values[i];
      if (value === "NA") row[header] = null;             // "NA" means no value
      else if (!isNaN(value)) row[header] = Number(value); // "45" becomes the number 45
      else row[header] = value;                           // text stays text
    });
    return row;
  });

  // Remember which colour belongs to which type
  pokemon.forEach(p => {
    if (p.type_1) typeColors[p.type_1] = p.color_1;
    if (p.type_2) typeColors[p.type_2] = p.color_2;
  });

  // Fill the suggestion list under the search box
  document.getElementById("names").innerHTML =
    pokemon.map(p => `<option value="${formatName(p.pokemon)}">`).join("");

  console.log("Loaded", pokemon.length, "Pokémon");
}

// ---------- Small helpers ----------

// "mr-mime" -> "Mr Mime"
function formatName(raw) {
  return raw.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
}

// Find a Pokémon by name ("Mr Mime" or "mr-mime") or by number ("25")
function findPokemon(text) {
  const key = text.trim().toLowerCase().replace(/\s+/g, "-").replace(/^#/, "");
  return pokemon.find(p => p.pokemon === key || String(p.id) === key);
}

// Add up the six base stats
function totalStats(p) {
  return STATS.reduce((sum, [key]) => sum + p[key], 0);
}

// The CSV's colour for this Pokémon (a mix of both types if it has two)
function colorOf(p) {
  return p.color_f || p.color_1;
}

// +25, -10 or 0
function signed(n) {
  return n > 0 ? `+${n}` : String(n);
}

function changeClass(n) {
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "same";
}

// ---------- The evolution logic ----------

// Every Pokémon that evolves FROM this one
function findEvolutions(p) {
  if (p.id > 10000) return [];   // special forms (Mega etc.) don't evolve
  return pokemon.filter(row => row.evolves_from_species_id === p.species_id);
}

// Compare a Pokémon with one of its evolutions and decide yes / maybe / no
function compare(before, after) {
  const gain = totalStats(after) - totalStats(before);
  const percent = Math.round((gain / totalStats(before)) * 100);

  const drops = STATS
    .filter(([key]) => after[key] < before[key])
    .map(([key, label]) => ({ label: label, amount: before[key] - after[key] }));
  const bigDrop = drops.some(d => d.amount >= 20);

  let verdict = "yes";
  if (gain < 0) verdict = "no";
  else if (gain === 0 || bigDrop) verdict = "maybe";

  return { after, gain, percent, drops, verdict };
}

// One sentence that explains a comparison
function reason(c) {
  const after = formatName(c.after.pokemon);
  const lost = c.drops.map(d => `${d.amount} ${d.label}`).join(" and ");

  if (c.verdict === "no") {
    return `${after} has ${-c.gain} fewer base stats in total. In the games you can press B to stop an evolution.`;
  }
  if (c.verdict === "maybe") {
    if (c.gain === 0) return `${after} has the same total, but it loses ${lost}. Only evolve if you like what it gains.`;
    return `${after} is stronger overall (+${c.gain}), but it loses ${lost}.`;
  }
  if (c.drops.length > 0) {
    return `${after} has ${c.gain} more base stats in total (+${c.percent}%) and only loses ${lost}.`;
  }
  return `${after} has ${c.gain} more base stats in total (+${c.percent}%), and none of its stats get worse.`;
}

// The big answer at the top
function overallVerdict(p, comparisons) {
  const name = formatName(p.pokemon);
  const best = comparisons.reduce((a, b) => (b.gain > a.gain ? b : a));
  let text = reason(best);

  if (comparisons.length > 1) {
    const allEqual = comparisons.every(c => c.gain === best.gain);
    if (allEqual) {
      text = `${name} can evolve into ${comparisons.length} different Pokémon. They're all equally strong overall (+${best.gain}), so pick the type you like best.`;
    } else {
      text = `${name} can evolve into ${comparisons.length} different Pokémon. The best choice is ${formatName(best.after.pokemon)}. ${reason(best)}`;
    }
  }
  return { kind: best.verdict, title: TITLES[best.verdict], text: text };
}

// The answer when there's nothing to evolve into
function noEvolutionVerdict(p) {
  const name = formatName(p.pokemon);
  if (p.id > 10000) {
    return { kind: "none", title: "It can't evolve", text: `${name} is a special form (like a Mega Evolution). Special forms can't evolve.` };
  }
  const pre = pokemon.find(row => row.species_id === p.evolves_from_species_id);
  if (pre) {
    return { kind: "none", title: "It's fully evolved", text: `${name} is already its final form. It evolves from ${formatName(pre.pokemon)}.` };
  }
  return { kind: "none", title: "It doesn't evolve", text: `${name} has no evolutions in this data.` };
}

// ---------- Building the HTML ----------
const searchBox = document.getElementById("search");
const result = document.getElementById("result");

function showPokemon(p) {
  document.body.style.setProperty("--accent", colorOf(p));
  const evolutions = findEvolutions(p);

  // Nothing to evolve into: show the answer and the Pokémon on its own
  if (evolutions.length === 0) {
    result.innerHTML = `
      ${verdictHtml(noEvolutionVerdict(p))}
      <article class="sheet" style="--poke: ${colorOf(p)}">
        ${profileHtml(p)}
        ${statsHtml(p)}
      </article>`;
    return;
  }

  // One or more evolutions: show the answer and a comparison for each
  const comparisons = evolutions.map(evo => compare(p, evo));
  result.innerHTML =
    verdictHtml(overallVerdict(p, comparisons)) +
    comparisons.map(c => compareHtml(p, c)).join("");
}

function verdictHtml(v) {
  return `
    <div class="verdict verdict-${v.kind}">
      <h2>${v.title}</h2>
      <p>${v.text}</p>
    </div>`;
}

function profileHtml(p) {
  return `
    <div class="profile">
      <div class="art">${imageHtml(p)}</div>
      <div>
        <p class="dex">#${String(p.species_id).padStart(3, "0")}</p>
        <h2 class="name">${formatName(p.pokemon)}</h2>
        <div class="types">${typesHtml(p)}</div>
        <p class="facts">${p.height / 10} m tall, ${p.weight / 10} kg</p>
      </div>
    </div>`;
}

// The picture if the data has one, otherwise a short message
function imageHtml(p) {
  if (p.url_image) {
    return `<img src="${IMAGE_BASE}${p.url_image}" alt="${formatName(p.pokemon)}">`;
  }
  return `<span class="no-image">No picture in the data</span>`;
}

function typesHtml(p) {
  return [p.type_1, p.type_2]
    .filter(type => type)                    // skip the empty second type
    .map(type => `<span class="type" style="--type: ${typeColors[type]}">${type}</span>`)
    .join("");
}

function statsHtml(p) {
  const rows = STATS.map(([key, label]) => `
    <div class="stat">
      <span class="stat-name">${label}</span>
      <span class="stat-value">${p[key]}</span>
      <span class="bar"><span style="width: ${(p[key] / 255) * 100}%"></span></span>
    </div>`).join("");

  return `
    <div class="stats">
      ${rows}
      <div class="stat total">
        <span class="stat-name">Total</span>
        <span class="stat-value">${totalStats(p)}</span>
      </div>
    </div>`;
}

// One side of the comparison (picture, name, types)
function sideHtml(p, label, extra) {
  return `
    <div class="side" style="--poke: ${colorOf(p)}">
      <p class="label">${label}</p>
      <div class="art">${imageHtml(p)}</div>
      <h3 class="name">${formatName(p.pokemon)}</h3>
      <div class="types">${typesHtml(p)}</div>
      ${extra}
    </div>`;
}

// A full comparison: before -> after, then the stat table
function compareHtml(before, c) {
  const afterName = formatName(c.after.pokemon);
  const extra = `
    <span class="tag tag-${c.verdict}">${TAGS[c.verdict]}</span>
    <button type="button" class="next" data-name="${c.after.pokemon}">Should I evolve ${afterName}?</button>`;

  return `
    <article class="sheet compare">
      <div class="compare-top">
        ${sideHtml(before, "Now", "")}
        <div class="arrow" aria-hidden="true">→</div>
        ${sideHtml(c.after, "After evolving", extra)}
      </div>
      ${compareStatsHtml(before, c.after)}
    </article>`;
}

function compareStatsHtml(before, after) {
  const rows = STATS.map(([key, label]) => {
    const change = after[key] - before[key];
    return `
      <div class="crow">
        <span class="stat-name">${label}</span>
        <span class="num">${before[key]}</span>
        <span class="num">${after[key]}</span>
        <span class="change ${changeClass(change)}">${signed(change)}</span>
      </div>`;
  }).join("");

  const totalChange = totalStats(after) - totalStats(before);
  return `
    <div class="cstats">
      <div class="crow chead">
        <span>Stat</span><span class="num">Now</span><span class="num">After</span><span class="num">Change</span>
      </div>
      ${rows}
      <div class="crow ctotal">
        <span class="stat-name">Total</span>
        <span class="num">${totalStats(before)}</span>
        <span class="num">${totalStats(after)}</span>
        <span class="change ${changeClass(totalChange)}">${signed(totalChange)}</span>
      </div>
    </div>`;
}

// ---------- Reacting to the visitor ----------

// Make the search box exactly as wide as the name inside it,
// by measuring an invisible copy of the text
const sizer = document.getElementById("sizer");

function resizeSearch() {
  sizer.textContent = searchBox.value || searchBox.placeholder;
  searchBox.style.width = (sizer.offsetWidth + 2) + "px";
}

// Pick a Pokémon by name: fill the box and show the answer
function choose(name) {
  const p = findPokemon(name);
  if (!p) return;
  searchBox.value = formatName(p.pokemon);
  resizeSearch();
  showPokemon(p);
}

// While typing: show the Pokémon as soon as the name matches
searchBox.addEventListener("input", () => {
  resizeSearch();
  const p = findPokemon(searchBox.value);
  if (p) showPokemon(p);
});

// Pressing Enter
document.getElementById("question-form").addEventListener("submit", event => {
  event.preventDefault();   // stop the page from reloading
  const p = findPokemon(searchBox.value);
  if (p) {
    showPokemon(p);
  } else {
    result.innerHTML = `<p class="empty">No Pokémon with that name or number. Pick one from the list.</p>`;
  }
});

// The "Try" buttons
document.querySelectorAll(".quick-picks button").forEach(button => {
  button.addEventListener("click", () => choose(button.dataset.name));
});

// The "Should I evolve ...?" buttons inside the answer
result.addEventListener("click", event => {
  const button = event.target.closest("button[data-name]");
  if (!button) return;
  choose(button.dataset.name);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.fonts.ready.then(resizeSearch);   // measure once the fonts have loaded
loadData();