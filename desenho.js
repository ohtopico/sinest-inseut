// --- Sinestinseut: parte de desenho compartilhada por index.html e gerador_mobile.html ---
// Cuida do quadro (mouse, dedo e caneta), da paleta, do pincel, da borracha,
// do "desfazer" e da conversão do desenho em dados HSV. Cada página só decide
// como tocar o som (servidor Python ou Web Audio no navegador).

(function () {
    const canvas = document.getElementById('drawingCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const colorPicker = document.getElementById('colorPicker');
    const brushSizeInput = document.getElementById('brushSize');
    const brushSizeValueSpan = document.getElementById('brushSizeValue');
    const undoButton = document.getElementById('undoButton');
    const eraserButton = document.getElementById('eraserButton');
    const dica = document.getElementById('dicaQuadro');
    const agulha = document.getElementById('agulha');
    const aviso = document.getElementById('aviso');

    const LIMITE_DESFAZER = 25;
    const historico = [];
    let isDrawing = false;
    let usandoBorracha = false;
    let temDesenho = false;

    // Fundo branco (o branco é ignorado na hora de gerar o som)
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- Paleta e pincel ---
    const botoesCor = document.querySelectorAll('.cor');
    const botoesPincel = document.querySelectorAll('[data-pincel]');

    function marcarCor(botaoAtivo) {
        botoesCor.forEach(b => b.setAttribute('aria-pressed', String(b === botaoAtivo)));
    }

    function usarBorracha(ativa) {
        usandoBorracha = ativa;
        if (eraserButton) eraserButton.setAttribute('aria-pressed', String(ativa));
        if (ativa) marcarCor(null);
    }

    botoesCor.forEach(botao => {
        botao.style.backgroundColor = botao.dataset.cor;
        botao.addEventListener('click', () => {
            colorPicker.value = botao.dataset.cor;
            usarBorracha(false);
            marcarCor(botao);
        });
    });

    colorPicker.addEventListener('input', () => {
        usarBorracha(false);
        marcarCor(null);
    });

    if (eraserButton) {
        eraserButton.addEventListener('click', () => usarBorracha(!usandoBorracha));
    }

    function atualizarPincel() {
        brushSizeValueSpan.textContent = brushSizeInput.value;
        botoesPincel.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pincel === brushSizeInput.value)));
    }

    botoesPincel.forEach(botao => {
        botao.addEventListener('click', () => {
            brushSizeInput.value = botao.dataset.pincel;
            atualizarPincel();
        });
    });
    brushSizeInput.addEventListener('input', atualizarPincel);
    atualizarPincel();

    // --- Desfazer ---
    function guardarEstado() {
        historico.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (historico.length > LIMITE_DESFAZER) historico.shift();
        undoButton.disabled = false;
    }

    function undo() {
        const anterior = historico.pop();
        if (anterior) ctx.putImageData(anterior, 0, 0);
        undoButton.disabled = historico.length === 0;
        if (historico.length === 0) mostrarDica(true);
    }
    undoButton.addEventListener('click', undo);

    function mostrarDica(visivel) {
        temDesenho = !visivel;
        if (dica) dica.classList.toggle('escondida', !visivel);
    }

    // --- Desenho com mouse, dedo ou caneta (Pointer Events) ---
    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        // Escala a posição: o quadro aparece em qualquer tamanho, mas o desenho é sempre 800x400
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        return { x, y };
    }

    function configurarPincel() {
        ctx.lineWidth = brushSizeInput.value;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = usandoBorracha ? '#ffffff' : colorPicker.value;
        ctx.fillStyle = ctx.strokeStyle;
    }

    function startDrawing(e) {
        if (e.button !== undefined && e.button > 0) return; // só botão principal
        e.preventDefault();
        guardarEstado();
        isDrawing = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (erro) { /* ponteiro já foi solto */ }

        const { x, y } = getMousePos(e);
        configurarPincel();
        // Um toque rápido também deixa uma bolinha
        ctx.beginPath();
        ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y);
        if (!usandoBorracha) mostrarDica(false);
    }

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const { x, y } = getMousePos(e);
        configurarPincel();
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    function stopDrawing() {
        isDrawing = false;
    }

    canvas.addEventListener('pointerdown', startDrawing);
    canvas.addEventListener('pointermove', draw);
    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointercancel', stopDrawing);
    canvas.addEventListener('lostpointercapture', stopDrawing);

    // --- Limpar ---
    function clearCanvas() {
        if (temDesenho) guardarEstado(); // dá para desfazer um "limpar" sem querer
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        mostrarDica(true);
    }

    // --- Conversão do desenho em dados ---

    /**
     * Converte RGB (0-255) para HSV (Matiz: 0-360, Saturação/Valor: 0-1)
     */
    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const v = max;
        const diff = max - min;
        const s = max === 0 ? 0 : diff / max;
        let h;
        if (diff === 0) h = 0;
        else if (max === r) h = (g - b) / diff + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / diff + 2;
        else h = (r - g) / diff + 4;
        h /= 6;
        return [h * 360, s, v];
    }

    function ehFundo(data, i) {
        return data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250;
    }

    /**
     * Coleta a cor média (HSV) de cada coluna vertical (pixel x) do quadro.
     * Colunas vazias viram [0, 0, 0] (silêncio).
     */
    function getDrawingData() {
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height).data;
        const drawingData = [];

        for (let x = 0; x < width; x++) {
            let rSum = 0, gSum = 0, bSum = 0;
            let pixelCount = 0;

            for (let y = 0; y < height; y++) {
                const index = (y * width + x) * 4;
                if (!ehFundo(imageData, index)) {
                    rSum += imageData[index];
                    gSum += imageData[index + 1];
                    bSum += imageData[index + 2];
                    pixelCount++;
                }
            }

            if (pixelCount > 0) {
                drawingData.push(rgbToHsv(
                    Math.round(rSum / pixelCount),
                    Math.round(gSum / pixelCount),
                    Math.round(bSum / pixelCount)
                ));
            } else {
                drawingData.push([0, 0, 0]);
            }
        }
        return drawingData;
    }

    function estaVazio() {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < data.length; i += 4) {
            if (!ehFundo(data, i)) return false;
        }
        return true;
    }

    // --- Agulha: mostra qual parte do desenho está tocando ---
    let quadroAgulha = null;

    function startPlayhead(getProgress) {
        stopPlayhead();
        agulha.classList.add('ativa');
        const passo = () => {
            const p = getProgress();
            if (p === null || p >= 1) {
                stopPlayhead();
                return;
            }
            agulha.style.left = (Math.max(0, p) * 100) + '%';
            quadroAgulha = requestAnimationFrame(passo);
        };
        passo();
    }

    function stopPlayhead() {
        if (quadroAgulha) cancelAnimationFrame(quadroAgulha);
        quadroAgulha = null;
        agulha.classList.remove('ativa');
    }

    // --- Aviso amigável ---
    let timerAviso = null;
    function toast(mensagem) {
        aviso.textContent = mensagem;
        aviso.classList.add('visivel');
        clearTimeout(timerAviso);
        timerAviso = setTimeout(() => aviso.classList.remove('visivel'), 3500);
    }

    // Atalho: Ctrl+Z desfaz
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undo();
        }
    });

    window.Desenho = {
        canvas, ctx, getDrawingData, estaVazio, clearCanvas,
        startPlayhead, stopPlayhead, toast
    };
    window.clearCanvas = clearCanvas; // compatível com onclick="clearCanvas()"
})();
