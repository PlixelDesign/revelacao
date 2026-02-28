const screen = document.querySelector("#screen");
const progress = document.querySelector("#progress");
const hintBtn = document.querySelector("#hintBtn");
const primaryBtn = document.querySelector("#primaryBtn");

const GUESSES_ENDPOINT = "/api/palpites";
const SHEETS_GUESSES_ENDPOINT = "https://script.google.com/macros/s/AKfycbx6FKXkkEa5KsOxTmn-B_7tmzm6xLau0zKHWBxM7g9_ZcknXktBGP4ZOMFXCc0WbIGj/exec";
const LOCAL_GUESSES_KEY = "palpites_bebe_local";

const STATE = {
  step: 0,
  digits: [],
  hintLevel: 0,
  hintTimer: null,
  primaryAction: null,
  pin: ["2", "7", "4"],
};

function setProgress(text) {
  progress.textContent = text;
}

function show(element, visible) {
  element.hidden = !visible;
}

function shuffleArray(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
}

async function saveGuessesToProject(players) {
  const response = await fetch(GUESSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(players),
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload && payload.error
      ? payload.error
      : "Nao foi possivel salvar os palpites no arquivo.";
    throw new Error(message);
  }

  return payload;
}

async function saveGuessesToSheets(players) {
  const response = await fetch(SHEETS_GUESSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(players),
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.ok !== true) {
    const message = payload && payload.error
      ? payload.error
      : "Nao foi possivel salvar os palpites na planilha.";
    throw new Error(message);
  }

  return payload;
}

function canUseProjectFileSave() {
  const host = window.location.hostname;
  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);

  return (
    window.location.protocol.startsWith("http") &&
    (host === "localhost" || host === "127.0.0.1" || isIpv4)
  );
}

function saveGuessesToBrowser(players) {
  let store = {
    updatedAt: null,
    submissions: [],
  };

  try {
    const raw = window.localStorage.getItem(LOCAL_GUESSES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (parsed && Array.isArray(parsed.submissions)) {
      store = parsed;
    }
  } catch {
    store = {
      updatedAt: null,
      submissions: [],
    };
  }

  const savedAt = new Date().toISOString();
  const nextStore = {
    updatedAt: savedAt,
    submissions: [
      ...store.submissions,
      {
        savedAt,
        players,
      },
    ],
  };

  try {
    window.localStorage.setItem(LOCAL_GUESSES_KEY, JSON.stringify(nextStore));

    return {
      ok: true,
      storage: "localStorage",
      submissions: nextStore.submissions.length,
    };
  } catch {
    try {
      window.sessionStorage.setItem(LOCAL_GUESSES_KEY, JSON.stringify(nextStore));

      return {
        ok: true,
        storage: "sessionStorage",
        submissions: nextStore.submissions.length,
      };
    } catch {
      STATE.fallbackGuesses = nextStore;

      return {
        ok: false,
        storage: "memory",
        submissions: nextStore.submissions.length,
      };
    }
  }
}

async function saveGuessesHybrid(players) {
  try {
    const payload = await saveGuessesToSheets(players);

    if (canUseProjectFileSave()) {
      saveGuessesToProject(players).catch(() => {
        // O envio principal ja foi salvo na planilha.
      });
    }

    return {
      ...payload,
      storage: "google-sheets",
    };
  } catch {
    // Se a planilha falhar, ainda tentamos os outros meios.
  }

  if (canUseProjectFileSave()) {
    try {
      const payload = await saveGuessesToProject(players);

      return {
        ...payload,
        storage: "file",
      };
    } catch {
      // Se a API local falhar, ainda tentamos salvar no navegador.
    }
  }

  return saveGuessesToBrowser(players);
}

function resetHints() {
  STATE.hintLevel = 0;
  show(hintBtn, true);
  clearTimeout(STATE.hintTimer);

  STATE.hintTimer = setTimeout(() => {
    STATE.hintLevel = Math.max(STATE.hintLevel, 1);
    window.renderHint();
  }, 18000);
}

hintBtn.addEventListener("click", () => {
  STATE.hintLevel = Math.min(STATE.hintLevel + 1, 3);
  window.renderHint();
});

primaryBtn.addEventListener("click", () => {
  if (typeof STATE.primaryAction === "function") {
    const result = STATE.primaryAction();

    if (result && typeof result.catch === "function") {
      result.catch(() => {
        // A propria acao trata os erros visiveis na interface.
      });
    }

    return;
  }

  next();
});

function next() {
  STATE.step += 1;
  render();
}

function go(step) {
  STATE.step = step;
  render();
}

function render() {
  clearTimeout(STATE.hintTimer);
  STATE.primaryAction = null;
  primaryBtn.disabled = false;
  show(primaryBtn, false);
  show(hintBtn, false);

  if (STATE.step === 0) return renderIntro();
  if (STATE.step === 1) return renderPuzzle1();
  if (STATE.step === 2) return renderPuzzle2();
  if (STATE.step === 3) return renderPuzzle3();
  if (STATE.step === 4) return renderSafe();
  if (STATE.step === 5) return renderReveal();

  return renderIntro();
}

function renderIntro() {
  setProgress("Etapa 1/4");

  screen.innerHTML = `
    <div class="card">
      <h1 class="h1">Miss\u00E3o: destravar a caixa do beb\u00EA</h1>
      <p class="p">
        Voc\u00EA est\u00E1 no zool\u00F3gico. Existem 3 desafios r\u00E1pidos e cada um libera
        <b>1 d\u00EDgito</b>. No fim, digite o PIN na caixa-forte para revelar o segredo,
        mas antes precisamos registrar quem est\u00E1 jogando.
      </p>

      <div class="form-box">
        <h3>Quem est\u00E1 jogando?</h3>
        <p class="p">Escolha quantas pessoas est\u00E3o participando e preencha os palpites.</p>

        <div class="form-label">Quantas pessoas est\u00E3o participando?</div>
        <div class="people-grid" id="peopleGrid">
          <button type="button" data-qtd="1">Estou sozinho</button>
          ${[2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => `
            <button type="button" data-qtd="${count}">${count}</button>
          `).join("")}
        </div>

        <div id="playersContainer" class="players-stack"></div>
        <div id="introStatus" class="notice intro-status" hidden></div>
      </div>
    </div>
  `;

  const grid = screen.querySelector("#peopleGrid");
  const container = screen.querySelector("#playersContainer");
  const introStatus = screen.querySelector("#introStatus");
  let totalPlayers = 0;

  function setIntroStatus(message = "", isError = false) {
    introStatus.hidden = !message;
    introStatus.textContent = message;
    introStatus.classList.toggle("error", Boolean(message) && isError);
  }

  function isIntroComplete() {
    if (!totalPlayers) return false;

    for (let player = 1; player <= totalPlayers; player += 1) {
      const nameField = document.getElementById(`name_${player}`);
      const guessField = document.querySelector(`input[name="guess_${player}"]:checked`);
      const name = nameField ? nameField.value.trim() : "";

      if (!name || !guessField) {
        return false;
      }
    }

    return true;
  }

  function syncIntroState() {
    const complete = isIntroComplete();

    primaryBtn.disabled = !complete;

    if (!totalPlayers) {
      setIntroStatus("");
      return;
    }

    if (complete) {
      setIntroStatus("");
      return;
    }

    setIntroStatus("Preencha o nome e o palpite de todas as pessoas para continuar.");
  }

  function renderPlayers() {
    container.innerHTML = Array.from({ length: totalPlayers }, (_, index) => {
      const playerNumber = index + 1;

      return `
        <section class="player-block">
          <strong>Pessoa ${playerNumber}</strong>

          <label class="form-label" for="name_${playerNumber}">Nome e sobrenome</label>
          <input
            type="text"
            id="name_${playerNumber}"
            placeholder="Digite o nome"
            autocomplete="name"
          >

          <div class="form-label">Voc\u00EA acha que \u00E9:</div>
          <div class="radio-group">
            <label>
              <input type="radio" name="guess_${playerNumber}" value="Menino">
              <span>Menino</span>
            </label>

            <label>
              <input type="radio" name="guess_${playerNumber}" value="Menina">
              <span>Menina</span>
            </label>
          </div>
        </section>
      `;
    }).join("");

    container.querySelectorAll('input[type="text"]').forEach((input) => {
      input.addEventListener("input", () => {
        setIntroStatus("");
        syncIntroState();
      });
    });

    container.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.addEventListener("change", () => {
        setIntroStatus("");
        syncIntroState();
      });
    });
  }

  grid.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      totalPlayers = Number(button.dataset.qtd);

      grid.querySelectorAll("button").forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      renderPlayers();
      syncIntroState();
    });
  });

  show(primaryBtn, true);
  primaryBtn.textContent = "Come\u00E7ar";
  primaryBtn.disabled = true;

  STATE.primaryAction = async () => {
    if (!totalPlayers) {
      setIntroStatus("Escolha quantas pessoas v\u00E3o participar para continuar.", true);
      return;
    }

    if (!isIntroComplete()) {
      setIntroStatus("Preencha o nome e o palpite de todas as pessoas para continuar.", true);
      syncIntroState();
      return;
    }

    setIntroStatus("");

    const players = [];

    for (let player = 1; player <= totalPlayers; player += 1) {
      const nameField = document.getElementById(`name_${player}`);
      const guessField = document.querySelector(`input[name="guess_${player}"]:checked`);

      players.push({
        nome: nameField ? nameField.value.trim() : "",
        palpite: guessField ? guessField.value : "",
      });
    }

    setIntroStatus("Salvando respostas...");
    primaryBtn.disabled = true;

    try {
      await saveGuessesHybrid(players);
      setIntroStatus("");
      go(1);
    } catch {
      setIntroStatus("");
      go(1);
    }
  };
}

function renderPuzzle1() {
  setProgress("Etapa 1/4");
  resetHints();

  const pawSpots = [
    { x: 20.4, y: 81.6, label: "Pegada esquerda inferior" },
    { x: 37.2, y: 69.4, label: "Pegada central" },
    { x: 62.8, y: 84.8, label: "Pegada perto da agua" },
    { x: 24.7, y: 93.8, label: "Pegada direita inferior" },
  ];

  const total = pawSpots.length;
  let found = 0;

  screen.innerHTML = `
    <div class="grid card">
      <div class="panel">
        <h2 class="h1" style="font-size:20px">Desafio 1 - Rastros do Zoo</h2>
        <p class="p">Encontre <b>${total}</b> pegadas escondidas no cenario.</p>
        <div id="hintBox" class="notice">Dica: procure perto da cerca e no chao.</div>
        <div class="small">Quando achar todas, voce ganha o 1o digito.</div>
      </div>
      <div class="stage img-stage">
        <div class="img-wrap">
          <img src="zoo-bg.png" alt="Cenario do zoologico" />
          <div class="overlay">
            ${pawSpots.map((spot) => `
              <div
                class="hotspot"
                data-paw
                role="button"
                tabindex="0"
                aria-label="${spot.label}"
                style="--x:${spot.x}%; --y:${spot.y}%"
              ></div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  const hintBox = screen.querySelector("#hintBox");
  const spots = [...screen.querySelectorAll("[data-paw]")];

  function syncHintMarkers() {
    const showMarkers = STATE.hintLevel >= 2;
    spots.forEach((spot) => {
      spot.classList.toggle("show-marker", showMarkers || spot.classList.contains("found"));
    });
  }

  function unlockDigit() {
    STATE.digits[0] = STATE.pin[0];
    show(primaryBtn, true);
    primaryBtn.textContent = `Pegou o 1o digito: ${STATE.digits[0]} - Continuar`;
    show(hintBtn, false);
    clearTimeout(STATE.hintTimer);
  }

  function markSpot(spot) {
    if (spot.classList.contains("found")) return;

    spot.classList.add("found", "show-marker");
    found += 1;
    hintBox.textContent = `Encontradas: ${found}/${total}`;

    if (found === total) {
      unlockDigit();
    }
  }

  spots.forEach((spot) => {
    spot.addEventListener("click", () => {
      markSpot(spot);
    });

    spot.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      markSpot(spot);
    });
  });

  function localHint() {
    if (found === total) return;

    if (STATE.hintLevel === 0) {
      hintBox.textContent = "Dica: procure perto da cerca e no chao.";
    }

    if (STATE.hintLevel === 1) {
      hintBox.textContent = "Dica: duas pegadas estao embaixo e uma esta mais alta perto da cerca.";
    }

    if (STATE.hintLevel === 2) {
      hintBox.textContent = "Dica forte: toque nas areas marcadas com a pata.";
    }

    if (STATE.hintLevel >= 3) {
      spots.forEach((spot) => spot.classList.add("found", "show-marker"));
      found = total;
      hintBox.textContent = `Ok, sem travar. Encontradas: ${found}/${total}`;
      unlockDigit();
    }

    syncHintMarkers();
  }

  syncHintMarkers();
  window.renderHint = localHint;
}

function renderPuzzle2() {
  setProgress("Etapa 2/4");
  resetHints();

  const tokenOptions = [
    { zone: "agua", name: "Tartaruga" },
    { zone: "floresta", name: "Macaco" },
    { zone: "selva", name: "Tigre" },
  ];
  const shuffledTokens = shuffleArray(tokenOptions);

  screen.innerHTML = `
    <div class="grid card">
      <div class="panel">
        <h2 class="h1" style="font-size:20px">Desafio 2 - Leve cada animal ao lugar certo</h2>
        <p class="p">Escolha um nome no painel e depois toque no habitat correspondente.</p>
        <div id="hintBox" class="notice">Dica: combine pelo nome.</div>
        <div class="small">Quando acertar os 3, voce ganha o 2o digito.</div>

        <div class="drags" style="margin-top:10px">
          ${shuffledTokens.map((token) => `
            <button class="token" type="button" data-zone="${token.zone}" data-name="${token.name}">${token.name}</button>
          `).join("")}
        </div>
      </div>

      <div class="stage img-stage">
        <div class="img-wrap">
          <img src="habitats-zoo.png" alt="Habitats do zoologico" />

          <div class="overlay">
            <div class="zone" data-zone="agua" style="left:16.5%; top:50%; width:30%; height:80%"></div>
            <div class="zone" data-zone="floresta" style="left:50%; top:50%; width:30%; height:80%"></div>
            <div class="zone" data-zone="selva" style="left:83.5%; top:50%; width:30%; height:80%"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const hintBox = screen.querySelector("#hintBox");
  const tokens = [...screen.querySelectorAll(".token")];
  const zones = [...screen.querySelectorAll(".zone")];

  let selected = null;
  let ok = 0;

  function unlockDigit() {
    STATE.digits[1] = STATE.pin[1];
    show(primaryBtn, true);
    primaryBtn.textContent = `Pegou o 2o digito: ${STATE.digits[1]} - Continuar`;
    show(hintBtn, false);
    clearTimeout(STATE.hintTimer);
  }

  tokens.forEach((token) => {
    token.addEventListener("click", () => {
      if (token.classList.contains("locked")) return;

      tokens.forEach((item) => item.classList.remove("selected"));
      token.classList.add("selected");
      selected = token;

      hintBox.classList.remove("error");
      hintBox.textContent = `Agora toque no habitat da ${token.dataset.name.toLowerCase()}.`;
    });
  });

  zones.forEach((zone) => {
    zone.addEventListener("click", () => {
      if (!selected) {
        hintBox.classList.remove("error");
        hintBox.textContent = "Primeiro toque em um nome: Tartaruga, Macaco ou Tigre.";
        return;
      }

      const need = selected.dataset.zone;
      const got = zone.dataset.zone;

      if (need === got && !zone.classList.contains("ok")) {
        zone.classList.add("ok", "correct");

        selected.classList.remove("selected");
        selected.classList.add("locked");
        selected.disabled = true;
        selected = null;

        ok += 1;
        hintBox.classList.remove("error");
        hintBox.textContent = `Acertos: ${ok}/3`;

        if (ok === 3) {
          unlockDigit();
        }
      } else {
        hintBox.classList.add("error");
        hintBox.textContent = "Ops - esse nao e o habitat certo. Tente outro.";

        setTimeout(() => {
          hintBox.classList.remove("error");
          hintBox.textContent = `Acertos: ${ok}/3`;
        }, 900);
      }
    });
  });

  function localHint() {
    if (ok === 3) return;

    if (STATE.hintLevel === 0) {
      hintBox.textContent = "Dica: combine pelo nome.";
    }

    if (STATE.hintLevel === 1) {
      hintBox.textContent = "Dica: Tartaruga vai na agua, Macaco vai na floresta e Tigre vai na selva.";
    }

    if (STATE.hintLevel === 2) {
      hintBox.textContent = "Dica forte: toque no nome do animal e depois toque no habitat correto.";
    }

    if (STATE.hintLevel >= 3) {
      zones.forEach((zone) => {
        zone.classList.add("ok", "correct");
      });

      tokens.forEach((token) => {
        token.classList.remove("selected");
        token.classList.add("locked");
        token.disabled = true;
      });

      selected = null;
      ok = 3;
      hintBox.textContent = "Fechado - sem travar.";
      unlockDigit();
    }
  }

  window.renderHint = localHint;
}

function renderPuzzle3() {
  setProgress("Etapa 3/4");
  resetHints();

  const steps = [
    { id: "unlock", label: "\uD83D\uDD13 Abrir o portao da jaula" },
    { id: "feed", label: "\uD83E\uDD69 Dar comida ao tigre" },
    { id: "record", label: "\uD83D\uDCF8 Registrar o cuidado" },
  ];
  const renderedSteps = shuffleArray(steps);
  const correct = ["unlock", "feed", "record"];
  let chosen = [];
  let chosenLabels = [];

  screen.innerHTML = `
    <div class="grid card">
      <div class="panel">
        <h2 class="h1" style="font-size:20px">Desafio 3 - Ajude o tratador a cuidar do tigre!</h2>
        <p class="p">Clique nos itens na ordem correta (3 passos).</p>
        <div id="hintBox" class="notice">Dica: primeiro abra a jaula, depois alimente, depois registre.</div>
        <div class="small">Quando acertar a sequencia, voce ganha o 3o digito.</div>
        <div class="small" style="margin-top:10px">Escolhas: <span id="picked">-</span></div>
      </div>

      <div class="stage img-stage">
        <div class="img-wrap">
          <img src="Jaula-leao.png" alt="Recinto do felino" />

          <div class="overlay">
            <div class="order" style="position:absolute; top:18px; left:18px; right:18px;">
              ${renderedSteps.map((step) => `
                <button type="button" data-step="${step.id}">${step.label}</button>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const hintBox = screen.querySelector("#hintBox");
  const picked = screen.querySelector("#picked");
  const buttons = [...screen.querySelectorAll("[data-step]")];

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;

      const stepId = button.getAttribute("data-step");
      const step = steps.find((item) => item.id === stepId);

      chosen.push(stepId);
      chosenLabels.push(step ? step.label : button.textContent.trim());
      button.disabled = true;
      picked.textContent = chosenLabels.join(" -> ");

      if (chosen.length !== 3) return;

      const isCorrect = chosen.every((value, index) => value === correct[index]);

      if (isCorrect) {
        STATE.digits[2] = STATE.pin[2];
        hintBox.classList.add("ok");
        hintBox.textContent = "Sequencia certa!";
        show(primaryBtn, true);
        primaryBtn.textContent = `Pegou o 3o digito: ${STATE.digits[2]} - Ir para a Caixa-forte`;
        show(hintBtn, false);
        clearTimeout(STATE.hintTimer);
        return;
      }

      hintBox.classList.add("error");
      hintBox.textContent = "Quase. Vamos tentar de novo.";

      setTimeout(() => {
        chosen = [];
        chosenLabels = [];
        picked.textContent = "-";
        buttons.forEach((item) => {
          item.disabled = false;
        });
        hintBox.classList.remove("error");
        hintBox.textContent = "Dica: primeiro abra a jaula, depois alimente, depois registre.";
      }, 900);
    });
  });

  function localHint() {
    if (STATE.digits[2]) return;

    if (STATE.hintLevel === 0) {
      hintBox.textContent = "Dica: primeiro abra a jaula, depois alimente, depois registre.";
    }

    if (STATE.hintLevel === 1) {
      hintBox.textContent = "Dica: abrir a jaula -> dar comida ao tigre -> registrar o cuidado.";
    }

    if (STATE.hintLevel === 2) {
      hintBox.textContent = "Dica forte: clique nesta ordem: Abrir o portao da jaula, Dar comida ao tigre, Registrar o cuidado.";
    }

    if (STATE.hintLevel >= 3) {
      STATE.digits[2] = STATE.pin[2];
      hintBox.classList.add("ok");
      hintBox.textContent = "Fechado - sem travar.";
      buttons.forEach((button) => {
        button.disabled = true;
      });
      show(primaryBtn, true);
      primaryBtn.textContent = `Pegou o 3o digito: ${STATE.digits[2]} - Ir para a Caixa-forte`;
      show(hintBtn, false);
      clearTimeout(STATE.hintTimer);
    }
  }

  window.renderHint = localHint;
}

function renderSafe() {
  setProgress("Etapa 4/4");

  const d1 = STATE.digits[0] ?? "*";
  const d2 = STATE.digits[1] ?? "*";
  const d3 = STATE.digits[2] ?? "*";

  screen.innerHTML = `
    <div class="card">
      <h2 class="h1">Caixa-forte</h2>
      <p class="p">Voce coletou os digitos: <b>${d1} ${d2} ${d3}</b></p>

      <div class="safe">
        <div class="pin">
          <input inputmode="numeric" maxlength="1" id="p1" />
          <input inputmode="numeric" maxlength="1" id="p2" />
          <input inputmode="numeric" maxlength="1" id="p3" />
        </div>
        <div id="msg" class="notice">Digite o codigo para abrir.</div>
      </div>

      <div class="small" style="margin-top:12px">
        Se errar, e so tentar de novo.
      </div>
    </div>
  `;

  const p1 = screen.querySelector("#p1");
  const p2 = screen.querySelector("#p2");
  const p3 = screen.querySelector("#p3");
  const msg = screen.querySelector("#msg");

  [p1, p2, p3].forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = (input.value || "").replace(/\D/g, "").slice(0, 1);
      const nextInput = [p1, p2, p3][index + 1];

      if (input.value && nextInput) {
        nextInput.focus();
      }

      check();
    });
  });

  function check() {
    const values = [p1.value, p2.value, p3.value];
    if (values.some((value) => value === "")) return;

    const isCorrect = values.every((value, index) => value === STATE.pin[index]);

    if (isCorrect) {
      msg.classList.remove("error");
      msg.classList.add("ok");
      msg.textContent = "Abriu! Preparando a revelacao...";
      setTimeout(() => go(5), 700);
      return;
    }

    msg.classList.add("error");
    const wrongDigits = [];

    values.forEach((value, index) => {
      if (value !== STATE.pin[index]) {
        wrongDigits.push(index + 1);
      }
    });

    msg.textContent = `Quase! O digito ${wrongDigits.join(" e ")} esta errado. Tente de novo.`;
    setTimeout(() => msg.classList.remove("error"), 900);
  }
}

function renderReveal() {
  setProgress("Revelacao");
  show(hintBtn, false);
  show(primaryBtn, false);

  screen.innerHTML = `
    <div class="card">
      <h2 class="h1">A caixa abriu...</h2>
      <p class="p">Momento da revelacao.</p>

      <div class="revealWrap">
        <video id="rv" controls playsinline preload="auto">
          <source src="reveal.mp4" type="video/mp4">
        </video>
        <img id="ri" src="reveal.png" alt="Revelacao" class="kenburns" hidden />
        <div class="confetti"></div>
      </div>

      <p id="revealStatus" class="small" style="margin-top:12px">
        Tentando iniciar o video com audio.
      </p>
    </div>
  `;

  const video = screen.querySelector("#rv");
  const image = screen.querySelector("#ri");
  const source = video.querySelector("source");
  const revealStatus = screen.querySelector("#revealStatus");
  const sourcePath = source ? source.getAttribute("src") : "";
  let imageRevealed = false;
  let videoReady = false;

  video.muted = false;
  video.defaultMuted = false;
  video.volume = 1;

  function showRevealImage(statusText, hideVideo = false) {
    if (imageRevealed) {
      return;
    }

    imageRevealed = true;
    if (hideVideo) {
      video.hidden = true;
      video.pause();
    }

    image.hidden = false;
    revealStatus.textContent = statusText;
  }

  function showImageFallback() {
    showRevealImage("O video nao carregou. A imagem foi exibida automaticamente.", true);
  }

  function markVideoReady() {
    if (imageRevealed || videoReady) {
      return;
    }

    videoReady = true;
    revealStatus.textContent = "O video carregou. A foto aparecera abaixo quando ele terminar.";
  }

  if (!sourcePath) {
    showImageFallback();
    return;
  }

  video.addEventListener("error", showImageFallback);
  if (source) {
    source.addEventListener("error", showImageFallback);
  }
  video.addEventListener("loadedmetadata", markVideoReady, { once: true });
  video.addEventListener("canplay", markVideoReady, { once: true });
  video.addEventListener("ended", () => {
    showRevealImage("A foto apareceu abaixo do video apos o fim da reproducao.");
  });

  video.load();

  const playAttempt = video.play();
  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt
      .then(() => {
        revealStatus.textContent = "O video iniciou automaticamente com audio, se o navegador permitir. A foto aparecera abaixo quando ele terminar.";
      })
      .catch(() => {
        revealStatus.textContent = "O navegador bloqueou o autoplay com audio. Use os controles do video para reproduzir. A foto aparecera abaixo quando o video terminar.";
      });
  }
}

function renderHint() {}

window.renderHint = renderHint;

render();
