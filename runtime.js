const run_button = document.getElementById('run-button');
const stop_button = document.getElementById('stop-button');
const runtime_status = document.getElementById('runtime-status');
const node_script_error = document.getElementById('node-script-error');
const console_content = document.getElementById('console-content');
const clear_console_button = document.getElementById('clear-console');

let next_timer_id = 1;

const audio_elements = new Map();
const globals = new Map();
const active_timers = new Map();

const runtime = {
    running: false,
    raf_id: null,
    last_time: 0,
    snapshot: null,
    keys_down: new Set()
};

const prefix_to_type = {G: 'group', O: 'object', S: 'sprite', A: 'audio', C: 'script'};

function getAudioElement(node) {
    let audio = audio_elements.get(node.id);
    if(!audio) {
        audio = new Audio();
        audio_elements.set(node.id, audio);
    }
    return audio;
}

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
                end: typeof end === 'function' ? end : null,
                onClone: typeof OnClone === 'function' ? OnClone : null,
                onDestroy: typeof OnDestroy === 'function' ? OnDestroy : null
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

function collectScripts(node, out = []) {
    if (node.type === 'script') out.push(node);
    for (const child_id of node.child_ids) {
        const child = hierarchy_nodes.get(child_id);
        if (child) collectScripts(child, out);
    }
    return out;
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

function getOBB(node) {
    const transform = node.transform;
    return {
        cx: transform.x + transform.width / 2,
        cy: transform.y + transform.height / 2,
        hw: transform.width / 2,
        hh: transform.height / 2,
        angle: transform.rotation || 0
    };
}

function getOBBCorners(obb) {
    const cos = Math.cos(obb.angle);
    const sin = Math.sin(obb.angle);
    const corners = [];
    for (const[sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = sx * obb.hw;
        const ly = sy * obb.hh;
        corners.push({x: obb.cs + lx * cos - ly * sin, y: obb.cy + lx * sin + ly * cos});
    }
    return corners;
}

function getOBBAxes(obb) {
    const cos = Math.cos(obb.angle);
    const sin = Math.sin(obb.angle);
    return [{x: cos, y: sin}, {x: -sin, y: cos}];
}

function projectAxis(corners, axis) {
    let min = Infinity;
    let max = -Infinity;
    for (const c of corners) {
        const p = c.x * axis.x + c.y * axis.y;
        if (p < min) min = p;
        if (p > max) max = p;
    }
    return {min, max};
}

function obbIntersects(node_a, node_b) {
    const obb_a = getOBB(node_a);
    const obb_b = getOBB(node_b);
    const corners_a = getOBBCorners(node_a);
    const corners_b = getOBBCorners(node_b);
    const axes = [...getOBBAxes(obb_a), ...getOBBAxes(obb_b)];

    for (const axis of axes) {
        const proj_a = projectAxis(corners_a, axis);
        const proj_b = projectAxis(corners_b, axis);
        if (proj_a.max < proj_b.min || proj_b.max < proj_a.min) return false;
    }

    return true;
}

node_script_code.addEventListener('blur', () => {
    const node = getSelected();
    if (node&& node.type === 'script') compileScript(node);
});

const matuAPI = {
    getNode(name) {
        const match = /^([GOSAC]):(.+)$/.exec(name);
        if (match) {
            const type = prefix_to_type[match[1]];
            for (const node of hierarchy_nodes.values()) {
                if (node.type === type && node.name === match[2]) return node;
            }
            return null;
        }
        for (const node of hierarchy_nodes.values()) {
            if (node.name === name) return node;
        }
        return null;
    },
    getNodeByID(id) {
        return hierarchy_nodes.get(id) || null;
    },
    spawn(type, parent_id, name) {
        const node = createNode(type, parent_id, name);
        if (!node) return null;
        renderUI();

        const script_nodes = collectScripts(node);
        for (const script_node of script_nodes) compileScript(script_node);

        for (const script_node of script_nodes) {
            const owner = hierarchy_nodes.get(script_node.parent_id);
            try {
                script_node.compiled?.start?.(owner, matuAPI);
            } catch (error) {
                reportScriptError(script_node, error);
            }
        }

        return node;
    },
    clone(node, parent_override_id) {
        if (!node) return null;
        const parent_id = parent_override_id !== undefined ? parent_override_id : node.parent_id;
        const clone = cloneNodeTree(node.id, parent_id);
        if (!clone) return null;

        renderUI();

        const script_nodes = collectScripts(clone);
        for (const script_node of script_nodes) compileScript(script_node);

        for (const script_node of script_nodes) {
            const owner = hierarchy_nodes.get(script_node.parent_id);
            try {
                script_node.compiled?.start?.(owner, matuAPI);
            } catch (error) {
                reportScriptError(script_node, error);
            }
            try {
                script_node.compiled?.onClone?.(owner, matuAPI, node);
            } catch (error) {
                reportScriptError(script_node, error);
            }
        }

        return clone;
    },
    destroy(node) {
        if (!node) return;
        const script_nodes = collectScripts(node);
        for (const script_node of script_nodes) {
            const owner = hierarchy_nodes.get(script_node.parent_id);
            try {
                script_node.compiled?.onDestroy?.(owner, matuAPI);
            } catch (error) {
                reportScriptError(script_node, error);
            }
        }
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
    },
    object: {
        setPosition(node, x, y) {
            if (!node || node.type !== 'object') return;
            node.transform.x = x;
            node.transform.y = y;
        },
        move(node, dx, dy) {
            if (!node || node.type !== 'object') return;
            node.transform.x += dx;
            node.transform.y += dy;
        },
        setRotation(node, degrees) {
            if (!node || node.type !== 'object') return;
            node.transform.rotation = degrees * Math.PI / 180;
        },
        rotate(node, degrees_delta) {
            if (!node || node.type !== 'object') return;
            node.transform.rotation += degrees_delta * Math.PI / 180;
        },
        setSize(node, width, height) {
            if (!node || node.type !== 'object') return;
            node.transform.width = width;
            node.transform.height = height;
        },
        setSprite(node, sprite) {
            if (!node || node.type !== 'object') return;
            if (sprite === null) {
                node.selected_sprite = null;
                return;
            }
            if (typeof sprite !== 'object' || sprite.type !== 'sprite') return;
            if (!node.child_ids.includes(sprite.id)) return;
            node.selected_sprite = sprite.id;
        },
        getSprite(node) {
            if (!node || node.type !== 'object') return null;
            return getSprite(node);
        }
    },
    sprite: {
        setOpacity(node, value) {
            if (!node || node.type !== 'sprite') return;
            node.opacity = Math.min(1, Math.max(0, value));
        },
        setVisible(node, visible) {
            if (!node || node.type !== 'sprite') return;
            node.visible = !!visible;
        },
        setAsset(node, asset_name) {
            if (!node || node.type !== 'sprite') return;
            node.asset_name = asset_name;
        }
    },
    audio: {
        play(node) {
            if (!node || node.type !== 'audio') return;
            if(!node.asset_name) {
                logToConsole(`${node.name} has no audio asset assigned`, 'error');
                return;
            }
            const url = getAssetURL(node.asset_name);
            if (!url) return;
            const audio = getAudioElement(node.asset_name);
            if(!url) return;
            const audio = getAudioElement(node);
            if (audio.src !== url) audio.src = url;
            audio.loop = node.loop;
            audio.volume = node.volume ?? 1;
            audio.currentTime = 0;
            audio.play().catch(() => {});
        },
        stop(node) {
            const audio = audio_elements.get(node.id);
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
        },
        pause(node) {
            audio_elements.get(node.id)?.pause();
        },
        resume(node) {
            audio_elements.get(node.id)?.play().catch(() => {});
        },
        isPlaying(node) {
            const audio = audio_elements.get(node.id);
            return !!audio && !audio.paused;
        },
        setVolume(node, value) {
            if (!node || node.type !== 'audio') return;
            node.volume = Math.min(1, Math.max(0, value));
            const audio = audio_elements.get(node.id);
            if (audio) audio.volume = node.volume;
        },
        setLoop(node, loop) {
            if (!node || node.type !== 'audio') return;
            node.loop = !!loop;
            const audio = audio_elements.get(node.id);
            if (audio) audio.loop = node.loop;
        },
        setAsset(node, asset_name) {
            if (!node || node.type !== 'audio') return;
            node.asset_name = asset_name;
            const audio = audio_elements.get(node.id);
            if (audio) audio.pause();
            audio_elements.delete(node.id);
        }
    },
    physics: {
        intersects(a, b) {
            if (!a || !b || a.type !== 'object' || b.type !== 'object') return false;
            return obbIntersects(a, b);
        },
        getCollisions(node) {
            const results = [];
            for (const other of hierarchy_nodes.values()) {
                if (other.type !== 'object' || other.id === node.id) continue;
                if (matuAPI.physics.intersects(node, other)) results.push(other);
            }
            return results;
        }
    },
    globals: {
        get(key, fallback=null) {
            return globals.has(key) ? globals.get(key) : fallback;
        },
        set(key, value) {
            globals.set(key, value);
        },
        has(key) {
            return globals.has(key);
        },
        delete(key) {
            globals.delete(key);
        }
    },
    scene: {
        setBackgroundColor(color) {
            scene_state.bg_color = color;
        },
        getBackgroundColor() {
            return scene_state.bg_color;
        }
    },
    timer: {
        after(seconds, callback) {
            const id = next_timer_id++;
            active_timers.set(id, {time: seconds, interval: null, repeat: false, callback});
            return id;
        },
        every(seconds, callback) {
            const id = next_timer_id++;
            active_timers.set(id, {time: seconds, interval: seconds, repeat: true, callback});
            return id;
        },
        cancel(id) {
            active_timers.delete(id);
        }
    }
};

window.addEventListener('keydown', (e) => runtime.keys_down.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => runtime.keys_down.delete(e.key.toLowerCase()));

function takeSnapshot() {
    const snap = new Map();
    for (const[id, node] of hierarchy_nodes.entries()) {
        if (node.type === 'object') {
            snap.set(id, {transform: {...node.transform}});
        } else if (node.type === 'sprite') {
            snap.set(id, {visible: node.visible, asset_name: node.asset_name, opacity: node.opacity});
        } else if (node.type === 'audio') {
            snap.set(id, {volume: node.volume, loop: node.loop, asset_name: node.asset_name});
        }
    }
    return {nodes: snap, bg_color: scene_state.bg_color};
}

function restoreSnapshot(snap) {
    for (const[id, saved] of snapshot.nodes.entries()) {
        const node = hierarchy_nodes.get(id);
        if (!node) continue;
        if (node.type === 'object') node.transform = {...saved.transform};
        else if (node.type === 'sprite') {
            node.visible = saved.visible;
            node.asset_name = saved.asset_name;
            node.opacity = saved.opacity;
        } else if (node.type === 'audio') {
            node.volume = saved.volume;
            node.loop = saved.loop;
            node.asset_name = saved.asset_name;
        }
    }
    scene_state.bg_color = snapshot.bg_color;
}

function setUI(running) {
    run_button.disabled = running;
    stop_button.disabled = !running;
    runtime_status.textContent = running ? 'running' : '';
}

function cloneNodeTree(source_id, new_parent_id) {
    const source = hierarchy_nodes.get(source_id);
    if (!source) null;

    const id = makeNodeID();
    const clone = {...source, id, parent_id: new_parent_id, child_ids: []};

    if (source.type === 'object') clone.transform = {...source.transform};
    if (source.type === 'script') {
        clone.compiled = null;
        clone.error = null;
    }

    clone.name = uniqueName(source.name, source.type, id);
    hierarchy_nodes.set(id, clone);

    if (new_parent_id) hierarchy_nodes.get(new_parent_id).child_ids.push(id);
    else hierarchy_roots.push(id);

    for (const child_id of source.child_ids) {
        cloneNodeTree(child_id, id);
    }

    return clone;
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
    globals.clear();
    active_timers.clear();
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

    for (const audio of audio_elements.values()) {
        audio.pause();
        audio.currentTime = 0;
    }

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

function updateTimers(dt) {
    for (const[id, timer] of active_timers.entries()) {
        timer.time -= dt;
        if (timer.time <= 0) {
            try {
                timer.callback();
            } catch(error) {
                logToConsole(`Timer error: ${error.message}`, 'error');
            }
            if (timer.repeat) timer.time += timer.interval;
            else active_timers.delete(id);
        }
    }
}

function tick(now) {
    updateTimers(dt);

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