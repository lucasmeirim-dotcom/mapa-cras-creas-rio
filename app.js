/* Mapa da rede de CRAS e CREAS do Rio — projeto pessoal, dados públicos da SMAS */
(function () {
  "use strict";

  const ATRIBUICOES = {
    CRAS: {
      titulo: "Proteção Social Básica",
      resumo: "Porta de entrada da assistência social. Atende famílias em situação de vulnerabilidade para prevenir o rompimento de vínculos e garantir acesso a direitos.",
      itens: [
        "Acompanhamento de famílias (PAIF – Serviço de Proteção e Atendimento Integral à Família)",
        "Serviço de Convivência e Fortalecimento de Vínculos para crianças, jovens, adultos e idosos",
        "Orientação sobre benefícios e programas sociais e encaminhamento para a rede de serviços",
        "Apoio para tirar documentos (certidão de nascimento, identidade e CPF – Documenta Rio)",
        "Cadastro Único: o atendimento é agendado pelo CADRio (cadunico.rio)",
      ],
      horario: "Segunda a sexta, das 8h às 17h, de preferência com agendamento na unidade mais próxima de casa.",
    },
    CREAS: {
      titulo: "Proteção Social Especial de Média Complexidade",
      resumo: "Atende famílias e pessoas que tiveram direitos violados: violência física, psicológica ou sexual, negligência, abandono, trabalho infantil, entre outras situações.",
      itens: [
        "Atendimento social e psicológico especializado (PAEFI)",
        "Apoio e fortalecimento de vínculos familiares e comunitários",
        "Orientação jurídica e encaminhamento para a rede de proteção (saúde, educação, justiça)",
        "Apoio na emissão de documentação pessoal",
        "Acompanhamento de adolescentes em medidas socioeducativas em meio aberto",
        "Atendimento especializado à população adulta em situação de rua",
      ],
      horario: "Segunda a sexta, das 8h às 17h. O atendimento é gratuito e pode ser procurado diretamente na unidade.",
    },
  };

  // bairros recentes que não aparecem nas listas de abrangência das CAS (atribuídos pela Região Administrativa)
  const BAIRRO_CAS_EXTRA = { "vila kennedy": 8, "osvaldo cruz": 5, "imperial de sao cristovao": 1, "argentino": 4, "barra olimpica": 7, "ingleses": 3 };
  const BAIRRO_DIVIDIDO = { "santissimo": [8, 9], "pavuna": [6, 4], "vila da penha": [6, 4] };

  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const partes = (txt) => String(txt).split(/, | e /).map((p) => p.trim()).filter(Boolean);
  const semParenteses = (s) => s.replace(/\s*\(.*?\)\s*/g, " ").trim();

  const S = { tipo: { CRAS: true, CREAS: true }, cas: "", busca: "", sel: null };
  let mapa, camadaUnid, camadaBairros, unidades = [], cas = [], marcadores = {};

  async function obter(nome) {
    if (window.__DADOS__) return window.__DADOS__[nome];
    const r = await fetch(nome, { cache: "no-cache" });
    if (!r.ok) throw new Error(nome + ": HTTP " + r.status);
    return r.json();
  }

  // ---------- busca por bairro ----------
  function unidadesDoBairro(q) {
    const n = norm(q);
    if (n.length < 3) return [];
    const bairrosDe = (u) => partes(u.abrangencia).map((p) => norm(semParenteses(p)));
    const exatas = unidades.filter((u) => bairrosDe(u).includes(n));
    if (exatas.length) return exatas;     // "Penha" não puxa "Vila da Penha"
    return unidades.filter((u) => bairrosDe(u).some((b) => b.startsWith(n) || (n.length >= 5 && b.includes(n))));
  }
  function casDoBairro(nomeBairro) {
    const n = norm(nomeBairro);
    if (BAIRRO_DIVIDIDO[n]) return BAIRRO_DIVIDIDO[n][0];
    if (BAIRRO_CAS_EXTRA[n]) return BAIRRO_CAS_EXTRA[n];
    for (const c of cas) {
      for (const p of partes(c.abr)) {
        let b = norm(p);
        if (b === "freguesia (ilha do governador)") b = "freguesia (ilha)";
        else if (!b.startsWith("freguesia")) b = norm(semParenteses(p));
        if (b === n) return c.n;
      }
    }
    return null;
  }

  // ---------- filtros ----------
  function visiveis() {
    const b = norm(S.busca);
    const porBairro = b.length >= 3 ? new Set(unidadesDoBairro(S.busca).map((u) => u.id)) : null;
    return unidades.filter((u) =>
      S.tipo[u.tipo] && (!S.cas || u.cas === +S.cas) &&
      (!b || norm(u.nome).includes(b) || (porBairro && porBairro.has(u.id))));
  }

  function icone(u, ativo) {
    const cls = "pin pin-" + u.tipo.toLowerCase() + (ativo ? " ativo" : "");
    return L.divIcon({ className: "", html: `<span class="${cls}" aria-hidden="true"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] });
  }

  function desenharUnidades() {
    camadaUnid.clearLayers(); marcadores = {};
    const lista = visiveis();
    for (const u of lista) {
      const m = L.marker([u.lat, u.lon], { icon: icone(u, u.id === S.sel), title: u.nome, keyboard: true, riseOnHover: true });
      m.on("click", () => selecionar(u.id, false));
      m.bindTooltip(`<b>${esc(u.nome)}</b><br>${esc(u.cas_nome)}`, { direction: "top", offset: [0, -10] });
      m.addTo(camadaUnid); marcadores[u.id] = m;
    }
    renderLista(lista);
  }

  function renderLista(lista) {
    const nCras = lista.filter((u) => u.tipo === "CRAS").length, nCreas = lista.length - nCras;
    const porBairro = norm(S.busca).length >= 3 ? unidadesDoBairro(S.busca) : [];
    $("#contagem").innerHTML = `<b>${lista.length}</b> unidades no mapa · ${nCras} CRAS · ${nCreas} CREAS`;
    $("#dica-bairro").innerHTML = porBairro.length
      ? `Unidades que atendem <b>${esc(S.busca)}</b>: ${porBairro.map((u) => `<button class="lnk" data-id="${u.id}">${esc(u.nome)}</button>`).join(", ")}`
      : "";
    $("#lista").innerHTML = lista.length ? lista.map((u) => `
      <li><button class="item ${u.id === S.sel ? "sel" : ""}" data-id="${u.id}">
        <span class="tag tag-${u.tipo.toLowerCase()}">${u.tipo}</span>
        <span class="nm">${esc(u.nome.replace(/^CRE?AS /, ""))}</span>
        <span class="sub">${esc(u.bairro)} · ${esc(u.cas_nome.split(" – ")[0])}</span>
      </button></li>`).join("") : `<li class="vazio">Nenhuma unidade com esses filtros.</li>`;
    document.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => selecionar(b.dataset.id, true)));
  }

  function selecionar(id, voar) {
    S.sel = id;
    const u = unidades.find((x) => x.id === id);
    desenharUnidades();
    if (!u) return;
    if (voar) mapa.flyTo([u.lat, u.lon], Math.max(mapa.getZoom(), 15), { duration: 0.6 });
    abrirFicha(u);
  }

  function abrirFicha(u) {
    const a = ATRIBUICOES[u.tipo];
    const sv = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${u.lat},${u.lon}`;
    const busca = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.endereco + ", Rio de Janeiro - RJ")}`;
    const rota = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(u.endereco + ", Rio de Janeiro - RJ")}`;
    const aprox = u.precisao !== "alta";
    $("#ficha").innerHTML = `
      <button class="fechar" id="fechar" aria-label="Fechar ficha">×</button>
      <div class="ficha-top">
        <span class="tag tag-${u.tipo.toLowerCase()}">${u.tipo}</span>
        <span class="ficha-cas">${esc(u.cas_nome)}</span>
      </div>
      <h2>${esc(u.nome)}</h2>
      <div class="acoes">
        <a class="btn prim" href="${sv}" target="_blank" rel="noopener">Ver a fachada no Street View</a>
        <a class="btn" href="${rota}" target="_blank" rel="noopener">Como chegar</a>
      </div>
      ${aprox ? `<p class="aviso">Posição aproximada no mapa: ${esc(u.metodo)}. Se o Street View abrir no lugar errado, <a href="${busca}" target="_blank" rel="noopener">procure o endereço no Google Maps</a>.</p>` : ""}
      <dl>
        <dt>Endereço</dt><dd>${esc(u.endereco)}</dd>
        ${u.referencia ? `<dt>Ponto de referência</dt><dd>${esc(u.referencia)}</dd>` : ""}
        <dt>E-mail</dt><dd><span class="sel-txt">${esc(u.email)}</span> <button class="copiar" data-copiar="${esc(u.email)}">Copiar</button></dd>
        <dt>Bairros atendidos</dt><dd>${esc(u.abrangencia)}</dd>
      </dl>
      <h3>O que o ${u.tipo} faz</h3>
      <p class="resumo">${esc(a.resumo)}</p>
      <ul class="atrib">${a.itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      <p class="horario"><b>Atendimento:</b> ${esc(a.horario)}</p>
      <p class="fonte">Fonte: <a href="${u.fonte}" target="_blank" rel="noopener">site da SMAS-Rio</a>. Telefones das unidades não são divulgados nessa página; use o e-mail.</p>`;
    document.body.classList.add("ficha-aberta");
    $("#ficha").scrollTop = 0;
    $("#fechar").onclick = fecharFicha;
    document.querySelectorAll("[data-copiar]").forEach((b) => (b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = "Copiado"; }
      catch (e) { const r = document.createRange(); r.selectNodeContents(b.previousElementSibling); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selecionado"; }
      setTimeout(() => (b.textContent = "Copiar"), 1800);
    }));
  }
  function fecharFicha() { S.sel = null; document.body.classList.remove("ficha-aberta"); desenharUnidades(); }

  // ---------- bairros por CAS (servidor de mapas da Prefeitura; opcional) ----------
  async function carregarBairros() {
    if (window.__DADOS__) return;   // na prévia sem internet externa, só o contorno do município
    const url = "https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Cartografia/Limites_administrativos/MapServer/4/query?where=1%3D1&outFields=nome&returnGeometry=true&outSR=4326&maxAllowableOffset=0.0003&geometryPrecision=5&f=geojson";
    try {
      const gj = await (await fetch(url)).json();
      camadaBairros = L.geoJSON(gj, {
        style: (f) => estiloBairro(f),
        onEachFeature: (f, l) => {
          const n = norm(f.properties.nome); const c = casDoBairro(f.properties.nome);
          f.properties._cas = c;
          const div = BAIRRO_DIVIDIDO[n] ? ` (dividido entre ${BAIRRO_DIVIDIDO[n].map((x) => x + "ª").join(" e ")} CAS)` : "";
          l.bindTooltip(`${esc(f.properties.nome)} · ${c ? c + "ª CAS" : "CAS não informada"}${div}`, { sticky: true, className: "tip-bairro" });
          l.on("click", () => { $("#busca").value = f.properties.nome; S.busca = f.properties.nome; desenharUnidades(); });
        },
      }).addTo(mapa);
      camadaBairros.bringToBack();
      $("#legenda-bairros").hidden = false;
    } catch (e) { /* sem a camada de bairros o mapa continua funcionando */ }
  }
  function estiloBairro(f) {
    const ativo = S.cas && f.properties._cas === +S.cas;
    return { color: "#00508a", weight: ativo ? 1.2 : 0.5, opacity: ativo ? 0.7 : 0.35, fillColor: "#00c0f4", fillOpacity: ativo ? 0.18 : 0.02 };
  }

  // ---------- montar ----------
  async function iniciar() {
    const gj = await obter("dados/unidades.geojson");
    cas = await obter("dados/cas.json");
    unidades = gj.features.map((f) => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));

    mapa = L.map("mapa", { zoomControl: false, zoomSnap: 0.25 }).setView([-22.92, -43.45], 10);
    L.control.zoom({ position: "topleft" }).addTo(mapa);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, subdomains: "abcd",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(mapa);
    try {
      const lim = await obter("dados/limite_municipio.geojson");
      L.geoJSON(lim, { style: { color: "#00508a", weight: 1.5, fillColor: "#ffffff", fillOpacity: window.__DADOS__ ? 0.9 : 0, interactive: false } }).addTo(mapa);
    } catch (e) {}
    camadaUnid = L.layerGroup().addTo(mapa);

    $("#f-cas").innerHTML = `<option value="">Todas as CAS</option>` + cas.map((c) => `<option value="${c.n}">${esc(c.nome)}</option>`).join("");
    $("#f-cras").onchange = (e) => { S.tipo.CRAS = e.target.checked; desenharUnidades(); };
    $("#f-creas").onchange = (e) => { S.tipo.CREAS = e.target.checked; desenharUnidades(); };
    $("#f-cas").onchange = (e) => {
      S.cas = e.target.value; desenharUnidades(); infoCas();
      if (camadaBairros) camadaBairros.setStyle(estiloBairro);
      const l = visiveis(); if (l.length) mapa.fitBounds(L.latLngBounds(l.map((u) => [u.lat, u.lon])).pad(0.3), { maxZoom: 14 });
    };
    $("#busca").oninput = (e) => { S.busca = e.target.value; desenharUnidades(); };
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sel) fecharFicha(); });

    desenharUnidades();
    const enquadrar = () => { mapa.invalidateSize(); mapa.fitBounds(L.latLngBounds(unidades.map((u) => [u.lat, u.lon])).pad(0.05)); };
    enquadrar(); setTimeout(enquadrar, 150);
    carregarBairros();
  }

  function infoCas() {
    const c = cas.find((x) => x.n === +S.cas);
    $("#info-cas").innerHTML = c ? `<b>${esc(c.nome)}</b><br>Sede: ${esc(c.end)}${c.tel ? `<br>Telefone: ${esc(c.tel)}` : ""}<br>E-mail: ${esc(c.email)}` : "";
    $("#info-cas").hidden = !c;
  }

  iniciar().catch((e) => { $("#lista").innerHTML = `<li class="vazio">Não foi possível carregar os dados (${esc(e.message)}).</li>`; });
})();
