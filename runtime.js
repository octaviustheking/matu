// functions
// function start (owner, matu) {}
// function update(owner, matu, dt) {}
// function end(owner, matu, dt) {}
// transformations: matu.transform.x and matu.transform.y

const run_button = document.getElementById('run-button');
const stop_button = document.getElementById('stop-button');
const runtime_status = document.getElementById('runtime-status');
const node_script_error = document.getElementById('node-script-error');
const console_content = document.getElementById('console-content');
const clear_console_button = document.getElementById('clear-console');

const runtime = {
    running: false,
    raf_id: null,
    last_time: 0,
    snapshot: null,
    keys_down: new Set()
};

function logToConsole(message, level='log') {
    const entry = document.createElement('div');
    entry.className = `console-entry console=${level}`;
    const time = new Date().toLocaleTimeString();
    entry.textContent = `[${time}] ${message}`;
    console_content.appendChild(entry);
    console_content.scrollTop = console_content.scrollHeight;
}

clear_console_button.addEventListener('click', () => {
    console_content.innerHTML = '';
});

function compileScript(node) {
    if (!node || node.type !== 'script') return;

    try {
        const factory = new Function(`
            "use strict";
            ${node.code}
            return {
                start: typeof start === 'function' ? start : null,
                update: typeof update === 'function' ? update : null,
                end: typeof end === 'function' ? end : null
            };    
        `);
        node.compiled = factory();
        node.error = null;
    } catch (error) {
        node.compiled = null;
        node.error = error.message;
        logToConsole(`Compiler error in ${node.name}: ${error.message}`, 'error');
    }

    if (selected_node_id === node.id) {
        showError(node);
    }
}

function compileAll() {
    let ok = true;
    for (const node of hierarchy_nodes.values()) {
        if (node.type !== 'script') continue;
        compileScript(node);
        if (node.error) ok = false;
    }

    return ok;
}

function showError(node) {
    if (node && node.error) {
        node_script_error.textContent = node.error;
        node_script_error.classList.add('show');
    } else {
        node_script_error.textContent = '';
        node_script_error.classList.remove('show');
    }
}

node_script_code.addEventListener('blur', () => {
    const node = getSelected();
    if (node&& node.type === 'script') compileScript(node);
});

const matuAPI = {
    getNode(name) {
        for (const node of hierarchy_nodes.values()) {
            if (node.name === name) return node;
        }
        return null;
    },
    getNodeByID(id) {
        return hierarchy_nodes.get(id) || null;
    },
    spawn(type, parentId, name) {
        const node = createNode(type, parentId, name);
        if (node) renderUI();
        return node;
    },
    destroy(node) {
        if (!node) return;
        deleteNode(node.id);
        renderUI();
    },
    input: {
        isDown(key) {
            return runtime.keys_down.has(key.toLowerCase());
        }
    },
    log(...args) {
        console.log('[script]', ...args);
        logToConsole(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ', 'log'));
    }
};

window.addEventListener('keydown', (e) => runtime.keys_down.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => runtime.keys_down.delete(e.key.toLowerCase()));

function takeSnapshot() {
    const snap = new Map();
    for (const [id, node] of hierarchy_nodes.entries()) {
        if (node.type === 'object') {
            snap.set(id, {transform: {...node.transform}});
        } else if (node.type === 'sprite') {
            snap.set(id, {visible: node.visible, asset_name: node.asset_name});
        } else if (node.type === 'audio') {
            snap.set(id, {volume: node.volume, loop: node.loop, asset_name: node.asset_name});
        }
    }
    return snap;
}

function restoreSnapshot(snap) {
    for (const [id, saved] of snap.entries()) {
        const node = hierarchy_nodes.get(id);
        if (!node) continue;
        if (node.type === 'object') {
            node.transform = {...saved.transform};
        } else if (node.type === 'sprite') {
            node.visible = saved.visible;
            node.asset_name = saved.asset_name;
        } else if (node.type === 'audio') {
            node.volume = saved.volume;
            node.loop = saved.loop;
            node.asset_name = saved.asset_name;
        }
    }
}

function setUI(running) {
    run_button.disabled = running;
    stop_button.disabled = !running;
    runtime_status.textContent = running ? 'running' : '';
}

function startRun() {
    if (runtime.running) return;

    const ok = compileAll();
    if (!ok) {
        runtime_status.textContent = 'compiling error: check script nodes';
        logToConsole('Run aborted: one or more scripts failed to compile', 'error');
        return;
    }

    runtime.snapshot = takeSnapshot();
    runtime.running = true;
    runtime.last_time = performance.now();
    runtime.keys_down.clear();
    setUI(true);
    logToConsole('Run started', 'info');

    for (const node of hierarchy_nodes.values()) {
        if (node.type !== 'script' || !node.compiled?.start) continue;
        const owner = hierarchy_nodes.get(node.parent_id);
        try {
            node.compiled.start(owner, matuAPI);
        } catch (error) {
            reportScriptError(node, error);
        }
    }

    runtime.raf_id = requestAnimationFrame(tick);
}

function stopRun() {
    if (!runtime.running) return;

    for (const node of hierarchy_nodes.values()) {
        if (node.type !== 'script' || !node.compiled?.end) continue;
        const owner = hierarchy_nodes.get(node.parent_id);
        try {
            node.compiled.end(owner, matuAPI);
        } catch (error) {
            reportScriptError(node, error);
        }
    }

    if (runtime.raf_id) cancelAnimationFrame(runtime.raf_id);
    runtime.raf_id = null;
    runtime.running = false;

    if (runtime.snapshot) restoreSnapshot(runtime.snapshot);
    runtime.snapshot = null;

    setUI(false);
    renderUI();
    logToConsole('Run stopped', 'info');

    const selected = getSelected();
    if (selected) openNodeInspector(selected);
}

function reportScriptError(node, error) {
    node.error = error.message;
    console.error(`Script error in ${node.name}: `, error);
    runtime_status.textContent = `error in ${node.name}: ${error.message}`;
    logToConsole(`Script error in ${node.name}: ${error.message}`, 'error');
    if (selected_node_id === node.id) showError(node);
}

function tick(now) {
    if (!runtime.running) return;

    const dt = (now - runtime.last_time) / 1000;
    runtime.last_time = now;

    for (const node of hierarchy_nodes.values()) {
        if (node.type !== 'script' || !node.compiled?.update) continue;
        const owner = hierarchy_nodes.get(node.parent_id);
        try {
            node.compiled.update(owner, matuAPI, dt);
        } catch (error) {
            reportScriptError(node, error);
        }
    }

    runtime.raf_id = requestAnimationFrame(tick);
}

run_button.addEventListener('click', startRun);
stop_button.addEventListener('click', stopRun);