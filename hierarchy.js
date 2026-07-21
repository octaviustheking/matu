const valid_children = {
    group: ['group', 'object'],
    object: ['sprite', 'audio', 'label', 'script'],
    sprite: [],
    audio: [],
    label: [],
    script: []
};

const node_icons = {
    group:  'G:',
    object: 'O:',
    sprite: 'S:',
    audio:  'A:',
    label: 'L:',
    script: 'C:'
}

const auto_close_pairs = {'(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`'};
const closing_chars = [')', ']', '}'];

let next_node_id = 1;

const hierarchy_nodes = new Map();
const hierarchy_roots = [];

let current_drop_indicator = null;
let dragged_node_id = null;

let selected_node_id = null;

let previous_width = 100;
let previous_height = 100;

// this section destroyed my hands lol
const hierarchy_content = document.getElementById('hierarchy-content');

const node_select_panel = document.getElementById('node-select');
const node_type_label = document.getElementById('node-type-label');
const node_name_input = document.getElementById('node-name');

const node_object_fields = document.getElementById('node-object-fields');
const node_x = document.getElementById('node-x');
const node_y = document.getElementById('node-y');
const node_width = document.getElementById('node-width');
const node_height = document.getElementById('node-height');
const node_dimension_lock = document.getElementById('dimensions-lock');
const node_proportion_lock = document.getElementById('proportion-lock');
const node_rotation = document.getElementById('node-rotation');
const node_object_sprite = document.getElementById('node-object-sprite')

const node_sprite_fields = document.getElementById('node-sprite-fields');
const node_sprite_asset = document.getElementById('node-sprite-asset');
const node_sprite_visible = document.getElementById('node-sprite-visible');
const node_sprite_opacity = document.getElementById('node-sprite-opacity');
const node_sprite_opacity_value = document.getElementById('node-sprite-opacity-value');

const node_audio_fields = document.getElementById('node-audio-fields');
const node_audio_asset = document.getElementById('node-audio-asset');
const node_audio_volume = document.getElementById('node-audio-volume');
const node_audio_volume_value = document.getElementById('node-audio-volume-value');
const node_audio_loop = document.getElementById('node-audio-loop');

const node_label_fields = document.getElementById('node-label-fields');
const node_label_text = document.getElementById('node-label-text');
const node_label_font = document.getElementById('node-label-font');
const node_label_size = document.getElementById('node-label-size');
const node_label_color = document.getElementById('node-label-color');
const node_label_visible = document.getElementById('node-label-visible');

const node_script_fields = document.getElementById('node-script-fields');
const node_script_code = document.getElementById('node-script-code');
const node_script_popout = document.getElementById('node-script-popout');
const script_popouts = new Map();

const node_delete_button = document.getElementById('node-delete');
const asset_select_panel = document.getElementById('asset-select');
const close_inspector_button = document.getElementById('close-inspector');

function makeNodeID() {
    return 'node_' + (next_node_id++);
}

function defaultNameFor(type) {
    const count = [...hierarchy_nodes.values()].filter(n => n.type === type).length + 1;
    const labels = {group: 'Group', object: 'Object', sprite: 'Sprite', audio: 'Audio', label: 'Label', script: 'Script'};
    return `${labels[type]} ${count}`;
}

function childAcceptable(parent_type, child_type) {
    return valid_children[parent_type]?.includes(child_type) ?? false;
}

function nameExists(name, type, ignore_id = null) {
    for (const node of hierarchy_nodes.values()) {
        if (node.id !== ignore_id && node.type === type && node.name === name) {
            return true;
        }
    }

    return false;
}

function uniqueName(name, type, ignore_id = null) {
    if (nameExists(name, type, ignore_id)) {
        let counter = 1;
        let new_name = `${name} ${counter + 1}`;

        while (nameExists(new_name, type, ignore_id)) {
            counter++;
            new_name = `${name} ${counter + 1}`;
        }

        return new_name;
    }

    return name;
}

function openPopout(node) {
    if (!node || node.type !== 'script') return;

    if (script_popouts.has(node.id)) {
        const popout = script_popouts.get(node.id);
        centerPopout(popout);
        bringToFront(popout);
        return;
    }

    const popout = document.createElement('div');
    popout.className = 'preview-window code-popout-window';
    popout.style.display = 'flex';

    popout.innerHTML = `
        <div class="preview-window-header panel-header">
            <h1 class="preview-header">${node.name}</h1>
            <p class="preview-file">Script</p>
            <button class="close-preview close-button">x</button>
        </div>
        <textarea class="popout-textarea" spellcheck="false"></textarea>
        <div class="popout-error"></div>
    `;

    const header = popout.querySelector('.preview-window-header');
    const close = popout.querySelector('.close-preview');
    const textarea = popout.querySelector('.popout-textarea');

    textarea.value = node.code;

    textarea.addEventListener('keydown', handleKeyDown);

    textarea.addEventListener('input', () => {
        node.code = textarea.value;
        if (selected_node_id === node.id) {
            node_script_code.value = node.code;
        }
    });

    textarea.addEventListener('blur', () => {
        compileScript(node);
    });

    close.onclick = () => {
        closePopout(node.id);
    };

    document.getElementById('center').appendChild(popout);

    centerPopout(popout);
    dragElement(popout, header);
    bringToFront(popout);

    script_popouts.set(node.id, popout);
    updateScriptErrors(node);
}

function centerPopout(popout) {
    const parent = document.getElementById('center');
    const width = popout.offsetWidth || 480;
    const height = popout.offsetHeight || 360;
    popout.style.left = (parent.clientWidth - width) / 2 + 'px';
    popout.style.top = (parent.clientHeight - height) / 2 + 'px';
}

function closePopout(node_id) {
    const popout = script_popouts.get(node_id);
    if (!popout) return;
    popout.remove();
    script_popouts.delete(node_id);
}

function syncCode(node) {
    const popout = script_popouts.get(node.id);
    if (!popout) return;
    const textarea = popout.querySelector('.popout-textarea');
    if (textarea && textarea.value !== node.code) textarea.value = node.code;
}

function syncPopoutTitle(node) {
    const popout = script_popouts.get(node.id);
    if (!popout) return;
    const title = popout.querySelector('.preview-header');
    if (title) title.textContent = node.name;
}

function fireInput(element) {
    element.dispatchEvent(new Event('input', {bubbles: true}));
}

function indentLines(element, outdent) {
    const value = element.value;
    const start = element.selectionStart;
    const end = element.selectionEnd;

    let line_start = value.lastIndexOf('\n', start - 1) + 1;
    let line_end = value.indexOf('\n', end - 1);
    if (line_end === -1) line_end = value.length;

    const before = value.slice(0, line_start);
    const selected = value.slice(line_start, line_end);
    const after = value.slice(line_end);

    const lines = selected.split('\n');
    let first_line_delta = 0;
    let total_delta = 0;

    const new_lines = lines.map((line, i) => {
        if (outdent) {
            let removed = 0;
            if (line.startsWith('    ')) removed = 4;
            else if (line.startsWith('\t')) removed = 1;
            else {
                const match = line.match(/^ +/);
                if (match) removed = Math.min(match[0].length, 4);
            }
            if (i === 0) first_line_delta = -removed;
            total_delta -= removed;
            return line.slice(removed);
        } else {
            if (i === 0) first_line_delta = 4;
            total_delta += 4;
            return '    ' + line; 
        }
    });

    element.value = before + new_lines.join('\n') + after;
    element.selectionStart = Math.max(line_start, start + first_line_delta);
    element.selectionEnd = end + total_delta;
    fireInput(element);
}

function handleKeyDown(e) {
    const element = e.target;

    if (e.key === 'Tab') {
        e.preventDefault();
        const start = element.selectionStart;
        const end = element.selectionEnd;

        if (start !== end && element.value.slice(start, end).includes('\n')) {
            indentLines(element, e.shiftKey);
            return;
        }

        if (e.shiftKey) {
            indentLines(element, true);
        } else {
            element.setRangeText('    ', start, end, 'end');
            fireInput(element);
        }
        return;
    }

    if (auto_close_pairs[e.key]) {
        const start = element.selectionStart;
        const end = element.selectionEnd;

        if (start !== end) {
            e.preventDefault();
            const selected = element.value.slice(start, end);
            element.setRangeText(e.key + selected + auto_close_pairs[e.key], start, end, 'end');
            fireInput(element);
            return;
        }

        const is_quote = e.key === '"' || e.key === "'" || e.key === '`';
        const next_char = element.value[start];

        if (is_quote && next_char === e.key) {
            e.preventDefault();
            element.selectionStart = element.selectionEnd = start + 1;
            return;
        }

        e.preventDefault();
        element.setRangeText(e.key + auto_close_pairs[e.key], start, end, 'start');
        element.selectionStart = element.selectionEnd = start + 1;
        fireInput(element);
        return;
    }

    if (closing_chars.includes(e.key)) {
        const start = element.selectionStart;
        if (element.selectionStart === element.selectionEnd && element.value[start] === e.key) {
            e.preventDefault();
            element.selectionStart = element.selectionEnd = start + 1;
        }

        return;
    }

    if (e.key === 'Backspace') {
        const start = element.selectionStart;
        const end = element.selectionEnd;

        if (start === end && start > 0) {
            const before = element.value[start - 1];
            const after = element.value[start];

            if (auto_close_pairs[before] === after) {
                e.preventDefault();
                element.setRangeText('', start - 1, start + 1, 'start');
                fireInput(element);
            }
        }
    }

    if (e.key === 'Enter') {
        e.preventDefault();

        const start = element.selectionStart;
        const end = element.selectionEnd;
        const value = element.value;

        const line_start = value.lastIndexOf('\n', start - 1) + 1;
        const current_line = value.slice(line_start, start);
        const indent = (current_line.match(/^[ \t]*/) || [''])[0];

        const opens = '([{';
        const closes = ')]}';
        const prev_char = value[start - 1];
        const next_char = value[end];

        const open_index = opens.indexOf(prev_char);
        const opening_now = open_index !== -1;
        const splitting_pair = opening_now && closes[open_index] === next_char;

        if (splitting_pair) {
            const inner_indent = indent + '    ';
            const insertion = '\n' + inner_indent + '\n' + indent;
            element.setRangeText(insertion, start, end, 'start');
            element.selectionStart = element.selectionEnd = start + 1 + inner_indent.length;
            fireInput(element);
            return;
        }

        const new_indent = opening_now ? indent + '    ' : indent;
        element.setRangeText('\n' + new_indent, start, end, 'end');
        fireInput(element);
        return;
    }
}

function createNode(type, parent_id = null, name = null) {
    if (parent_id === null && type !== 'group' && type !== 'object') {
        console.warn(`createNode: ${type} must have a parent object, not a top-level node`);
        return null;
    }

    if (parent_id !== null) {
        const parent = hierarchy_nodes.get(parent_id);
        if (!parent) {
            console.warn('createNode: parent not found', parent_id);
            return null;
        }
        if (!childAcceptable(parent.type, type)) {
            console.warn(`createNode: a ${parent.type} cannot contain a ${type}`);
            return null;
        }
    }

    const id = makeNodeID();
    const node = {id, type, name: name ?? defaultNameFor(type), parent_id, child_ids: []};

    if (type === 'object') {
        node.transform = {x: 0, y: 0, width: 100, height: 100, rotation: 0};
        node.dimension_lock = false;
        node.selected_sprite = null;
        node.aspect_ratio = 1;
        node.proportion_lock = false;
    } else if (type === 'sprite') {
        node.asset_name = null;
        node.visible = true;
        node.opacity = 1;
    } else if (type === 'audio') {
        node.asset_name = null;
        node.volume = 1;
        node.loop = false;
    } else if (type === 'label') {
        node.text = 'Label';
        node.font_size = 16;
        node.font_family = 'JetBrains Mono';
        node.color = '#ffffff';
        node.visible = true;
    } else if (type === 'script') {
        node.code = '';
        node.compiled = null;
        node.error = null;
    }

    hierarchy_nodes.set(id, node);

    if (parent_id) {
        hierarchy_nodes.get(parent_id).child_ids.push(id);
    } else {
        hierarchy_roots.push(id);
    }

    return node;
}

function getNode(id) {
    return hierarchy_nodes.get(id);
}

function deleteNode(id) {
    const node = hierarchy_nodes.get(id);
    if (!node) return;

    [...node.child_ids].forEach(child_id => deleteNode(child_id));

    if (node.parent_id) {
        const parent = hierarchy_nodes.get(node.parent_id);
        if (parent) parent.child_ids = parent.child_ids.filter(cid => cid !== id);
    } else {
        const index = hierarchy_roots.indexOf(id);
        if (index !== -1) hierarchy_roots.splice(index, 1);
    }

    if (node.type === 'script') closePopout(id);

    hierarchy_nodes.delete(id);

    if (selected_node_id === id) {
        selected_node_id = null;
    }
}

function isDescendant(candidate_id, ancestor_id) {
    let node = hierarchy_nodes.get(candidate_id);
    while (node && node.parent_id) {
        if (node.parent_id === ancestor_id) return true;
        node = hierarchy_nodes.get(node.parent_id);
    }

    return false;
}

function clearIndicator() {
    if (!current_drop_indicator) return;
    current_drop_indicator.classList.remove('drop-before', 'drop-after', 'drop-inside');
    current_drop_indicator = null;
}

function moveNode(id, new_parent_id, insert_index) {
    const node = hierarchy_nodes.get(id);
    if (!node) return false;

    if (new_parent_id) {
        const parent = hierarchy_nodes.get(new_parent_id);
        if (!parent || !childAcceptable(parent.type, node.type)) return false;
        if (id === new_parent_id || isDescendant(new_parent_id, id)) return false;
    } else if (node.type !== 'group' && node.type !== 'object') {
        return false;
    }

    let old_array;

    if (node.parent_id) {
        old_array = hierarchy_nodes.get(node.parent_id).child_ids;
    } else {
        old_array = hierarchy_roots;
    }

    const old_index = old_array.indexOf(id);
    if (old_index !== -1) {
        old_array.splice(old_index, 1);
    }

    const same_parent = node.parent_id === new_parent_id;

    if (same_parent && old_index < insert_index) {  // broo i can't stop typing idnex instead of index aksd;fkadsl; where is autocorrect when you need it...
        insert_index--;
    }

    node.parent_id = new_parent_id;

    let new_array;

    if (new_parent_id) {
        new_array = hierarchy_nodes.get(new_parent_id).child_ids;
    } else {
        new_array = hierarchy_roots;
    }

    insert_index = Math.max(0, Math.min(insert_index, new_array.length));
    new_array.splice(insert_index, 0, id);

    return true;
}

function getRenderables() {
    const results = [];
    for (const node of hierarchy_nodes.values()) {
        if (node.type !== 'object') continue;
        let sprite_node = null;

        if (node.selected_sprite) {
            const candidate = hierarchy_nodes.get(node.selected_sprite);

            if (candidate && candidate.type === 'sprite' && candidate.visible && candidate.asset_name) {
                sprite_node = candidate;
            }
        }

        if (!sprite_node) {
            sprite_node = node.child_ids.map(id => hierarchy_nodes.get(id)).find(child => child && child.type === 'sprite' && child.visible && child.asset_name);
        }

        results.push({object_node: node, sprite_node});
    }

    return results;
}

function renderUI() {
    hierarchy_content.innerHTML = '';
    hierarchy_roots.forEach(id => hierarchy_content.appendChild(buildNodeElement(id, 0)));
}

function buildNodeElement(id, depth) {
    const node = hierarchy_nodes.get(id);

    const row = document.createElement('div');
    row.className = 'hierarchy-node';
    row.style.paddingLeft = 8 + (depth * 16) + 'px';
    row.dataset.id = id;

    if (id === selected_node_id && id !== dragged_node_id) {
        row.classList.add('hierarchy-node-selected');
    }

    const icon = document.createElement('span');
    icon.className = 'hierarchy-node-icon';
    icon.textContent = node_icons[node.type];

    const label = document.createElement('span');
    label.className = 'hierarchy-node-label';
    label.textContent = node.name;

    row.appendChild(icon);
    row.appendChild(label);

    row.addEventListener('click', (e) => {
        e.stopPropagation();
        selectNode(id);
    });

    row.draggable = true;

    row.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        document.body.classList.add('dragging-node');
        dragged_node_id = id;
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';

        row.classList.remove('hierarchy-node-selected');
    });

    row.addEventListener('dragover', (e) => {
        e.stopPropagation();
        e.preventDefault();

        clearIndicator();

        const rect = row.getBoundingClientRect();
        const y = e.clientY - rect.top;

        if (y < rect.height * 0.25) {
            row.classList.add('drop-before');
        } else if (y > rect.height * 0.75) {
            row.classList.add('drop-after');
        } else {
            const dragged = hierarchy_nodes.get(dragged_node_id);
            if (dragged && childAcceptable(node.type, dragged.type)) {
                row.classList.add('drop-inside');
            }
        }

        current_drop_indicator = row;
    });

    row.addEventListener('dragend', (e) => {
        e.stopPropagation();
        document.body.classList.remove('dragging-node');
        clearIndicator();
        dragged_node_id = null;
        renderUI();
    });

    row.addEventListener('drop', (e) => {
        e.stopPropagation();
        e.preventDefault();

        clearIndicator();
        const dragged_id = e.dataTransfer.getData('text/plain');
        if (!dragged_id || dragged_id === id) return;

        const rect = row.getBoundingClientRect();
        const y = e.clientY - rect.top;

        if (y < rect.height * 0.25) {
            const parent_id = node.parent_id;
            const siblings = parent_id ? hierarchy_nodes.get(parent_id).child_ids : hierarchy_roots;

            moveNode(dragged_id, parent_id, siblings.indexOf(id));  // I KEEP TYPING IDNEXOF ASLKDJFLAKSJD;L
        } else if (y > rect.height * 0.75) {
            const parent_id = node.parent_id;
            const siblings = parent_id ? hierarchy_nodes.get(parent_id).child_ids : hierarchy_roots;

            moveNode(dragged_id, parent_id, siblings.indexOf(id) + 1);
        } else {
            moveNode(dragged_id, id, hierarchy_nodes.get(id).child_ids.length);
        }

        renderUI();
    });

    const wrapper = document.createElement('div');
    wrapper.appendChild(row);

    node.child_ids.forEach(child_id => {
        wrapper.appendChild(buildNodeElement(child_id, depth + 1));
    });

    return wrapper;
}

function selectNode(id) {
    selected_node_id = id;
    renderUI();
    openNodeInspector(hierarchy_nodes.get(id));
}

function getSelected() {
    return selected_node_id ? hierarchy_nodes.get(selected_node_id) : null;
}

function assetOptions(select_el, mime_prefix, current_asset_name) {
    select_el.innerHTML = '<option value="">None</option>';

    for (const [name, file] of asset_files.entries()) {
        if (!file.type.startsWith(mime_prefix)) continue;
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select_el.appendChild(option);
    }

    select_el.value = current_asset_name || '';
}

function getSprite(object) {
    if (object.selected_sprite) {
        const sprite = hierarchy_nodes.get(object.selected_sprite);
        if (sprite) return sprite;
    }

    return object.child_ids.map(id => hierarchy_nodes.get(id)).find(node => node && node.type === 'sprite');
}

function toAssetSize(object) {
    const sprite = getSprite(object);
    if (!sprite || !sprite.asset_name) return;

    const image = getAssetImage(sprite.asset_name);
    if (!image || !image.complete) return;

    object.transform.width = image.naturalWidth;
    object.transform.height = image.naturalHeight;

    object.aspect_ratio = image.naturalWidth / image.naturalHeight;

    node_width.value = object.transform.width;
    node_height.value = object.transform.height;

    previous_width = object.transform.width;
    previous_height = object.transform.height;
}

function spriteOptions(object) {
    node_object_sprite.innerHTML = '';

    const sprites = object.child_ids.map(id => hierarchy_nodes.get(id)).filter(node => node && node.type === 'sprite');

    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Auto';
    node_object_sprite.appendChild(none);

    for (const sprite of sprites) {
        const option = document.createElement('option');
        option.value = sprite.id;
        option.textContent = sprite.name;
        node_object_sprite.appendChild(option);
    }

    node_object_sprite.value = object.selected_sprite ?? '';
}

function openNodeInspector(node) {
    if (!node) return;

    asset_select_panel.style.display = 'none';
    document.querySelectorAll('.asset-item').forEach(tile => tile.classList.remove('asset-selected'));

    node_select_panel.style.display = 'flex';
    close_inspector_button.classList.add('show');

    node_type_label.textContent = 'Node type: ' + node.type;
    node_name_input.value = node.name;

    node_object_fields.style.display = node.type === 'object' ? 'flex' : 'none';
    node_sprite_fields.style.display = node.type === 'sprite' ? 'flex' : 'none';
    node_audio_fields.style.display = node.type === 'audio' ? 'flex' : 'none';
    node_label_fields.style.display = node.type === 'label' ? 'flex' : 'none';
    node_script_fields.style.display = node.type === 'script' ? 'flex' : 'none';

    if (node.type === 'object') {
        node.aspect_ratio = node.transform.width / node.transform.height;

        node_x.value = node.transform.x;
        node_y.value = node.transform.y;
        node_width.value = node.transform.width;
        node_height.value = node.transform.height;

        node_dimension_lock.checked = node.dimension_lock;
        node_proportion_lock.checked = node.proportion_lock;

        node_rotation.value = (node.transform.rotation * 180 / Math.PI).toFixed(1);

        previous_width = node.transform.width;
        previous_height = node.transform.height;

        spriteOptions(node);
    } else if (node.type === 'sprite') {
        assetOptions(node_sprite_asset, 'image/', node.asset_name);
        node_sprite_visible.checked = node.visible;
        node_sprite_opacity.value = node.opacity ?? 1;
        node_sprite_opacity_value.textContent = Math.round((node.opacity ?? 1) * 100);
    } else if (node.type === 'audio') {
        assetOptions(node_audio_asset, 'audio/', node.asset_name);
        node_audio_volume.value = node.volume ?? 1;
        node_audio_volume_value.value = Math.round((node.volume ?? 1) * 100);
        node_audio_loop.checked = node.loop;
    } else if (node.type === 'label') {
        node_label_text.value = node.text;
        node_label_font.value = node.font_family;
        node_label_size.value = node.font_size;
        node_label_color.value = node.color;
        node_label_visible.checked = node.visible;
    } else if (node.type === 'script') {
        node_script_code.value = node.code;
    }

    if (node.type === 'script') {
        updateScriptErrors(node);
    } else {
        showError(null);
    }
}

function closeNodeInspector() {
    node_select_panel.style.display = 'none';
    close_inspector_button.classList.remove('show');
}

function transformObject(changed) {
    const node = getSelected();
    if (!node || node.type !== 'object') return;

    node.transform.x = Number(node_x.value);
    node.transform.y = Number(node_y.value);

    if (changed === 'width' && node_width.value === '') return;
    if (changed === 'height' && node_height.value === '') return;

    let width = node_width.valueAsNumber;
    let height = node_height.valueAsNumber;

    if (Number.isNaN(width) || Number.isNaN(height)) {
        return;
    }

    if (node.dimension_lock) {
        if (changed === 'width') {
            height = width / node.aspect_ratio;
            node_height.value = height;
        } else if (changed === 'height') {
            width = height * node.aspect_ratio;
            node_width.value = width;
        }
    } else {
        node.aspect_ratio = width / height;
    }

    node.transform.width = width;
    node.transform.height = height;

    previous_width = width;
    previous_height = height;
}

node_name_input.addEventListener('input', () => {
    const node = getSelected();
    if (!node) return;

    node.name = node_name_input.value;
    renderUI();

    if (node.type === 'sprite') {
        const parent = getNode(node.parent_id);
        if (parent?.type === 'object') {
            assetOptions(parent);
        }
    }

    if (node.type === 'script') {
        syncPopoutTitle(node);
    }
});

node_name_input.addEventListener('blur', () => {
    const node = getSelected();
    let working_name = node_name_input.value;

    node.name = uniqueName(working_name, node.type, node.id);

    node_name_input.value = node.name;
    renderUI();

    if (node.type === 'script') {
        syncPopoutTitle(node);
    }
});

node_x.addEventListener('input', () => transformObject());
node_y.addEventListener('input', () => transformObject());

node_width.addEventListener('input', () => transformObject('width'));
node_height.addEventListener('input', () => transformObject('height'));

node_dimension_lock.addEventListener('change', () => {
    const node = getSelected();
    if (!node || node.type !== 'object') return;

    node.dimension_lock = node_dimension_lock.checked;

    if (!node.dimension_lock) {
        node.proportion_lock = false;
        node_proportion_lock.checked = false;
    }
});

node_proportion_lock.addEventListener('change', () => {
    const node = getSelected();
    if (!node || node.type !== 'object') return;
    
    node.proportion_lock = node_proportion_lock.checked;
    console.log(node.proportion_lock)
    if (node.proportion_lock) {
        node.dimension_lock = true;
        node_dimension_lock.checked = true;

        toAssetSize(node);
    }
});

node_rotation.addEventListener('input', () => {
    const node = getSelected();
    if (!node || node.type !== 'object') return;
    node.transform.rotation = Number(node_rotation.value) * Math.PI / 180;
});

node_object_sprite.addEventListener('change', () => {
    const node = getSelected();
    if (!node || node.type !== 'object') return;
    node.selected_sprite = node_object_sprite.value || null;
})

node_sprite_asset.addEventListener('change', () => {
    const node = getSelected();
    if (!node || node.type !== 'sprite') return;
    node.asset_name = node_sprite_asset.value || null;
});

node_sprite_visible.addEventListener('change', () => {
    const node = getSelected();
    if (!node || node.type !== 'sprite') return;
    node.visible = node_sprite_visible.checked;
});

node_sprite_opacity.addEventListener('input', () => {
    const node = getSelected();
    if (!node || node.type !== 'sprite') return;

    node.opacity = Number(node_sprite_opacity.value);
    node_sprite_opacity_value.textContent = Math.round(node.opacity * 100);
})

node_sprite_opacity_value.addEventListener('input', () => {
    const node = getSelected();
    if (!node || node.type !== 'sprite') return;

    let percent = Number(node_sprite_opacity_value.value);

    if (Number.isNaN(percent)) return;

    percent = Math.min(100, Math.max(0, percent));

    node.opacity = percent / 100;
    node_sprite_opacity.value = node.opacity;

    node_sprite_opacity_value.value = percent;
})

node_audio_asset.addEventListener('change', () => {
    const node = getSelected();
    if (!node || node.type !== 'audio') return;
    node.asset_name = node_audio_asset.value || null;
});

node_audio_volume.addEventListener('input', () => {
    const node = getSelected();
    if (!node || node.type !== 'audio') return;

    node.volume = Number(node_audio_volume.value);
    node_audio_volume_value.value = Math.round(node.volume * 100);
});

node_audio_volume_value.addEventListener('input', () => {
    const node = getSelected();
    if(!node || node.type !== 'audio') return;

    let percent = Number(node_audio_volume_value.value);

    if (Number.isNaN(percent)) return;

    percent = Math.min(100, Math.max(0, percent));

    node.volume = percent / 100;
    node_audio_volume.value = node.volume;

    node_audio_volume_value.value = percent;
})

node_audio_loop.addEventListener('change', () => {
    const node = getSelected();
    if (!node || node.type !== 'audio') return;
    node.loop = node_audio_loop.checked;
});

node_label_text.addEventListener('input', () => {
    const node = getSelected();
    if (!node || node.type !== 'label') return;
    node.text = node_label_text.value;
});

node_label_font.addEventListener('change', () => {
    const node = getSelected();
    if (!node || node.type !== 'label') return;
    node.font_family = node_label_font.value;
});

node_label_size.addEventListener('input', () => {
    const node = getSelected();
    if (!node || node.type !== 'label') return;
    const value = Number(node_label_size.value);
    if (!Number.isNaN(value) && value > 0) node.font_size = value;
});

node_label_color.addEventListener('input', () => {
    const node = getSelected();
    if (!node || node.type !== 'label') return;
    node.color = node_label_color.value;
});

node_label_visible.addEventListener('change', () => {
    const node = getSelected();
    if (!node || node.type !== 'label') return;
    node.visible = node_label_visible.checked;
});

node_script_code.addEventListener('input', () => {
    const node = getSelected();
    if (!node || node.type !== 'script') return;
    node.code = node_script_code.value;
    syncCode(node);
});

node_script_code.addEventListener('keydown', handleKeyDown);

node_script_popout.addEventListener('click', () => {
    const node = getSelected();
    if (!node || node.type !== 'script') return;
    openPopout(node);
});

node_delete_button.addEventListener('click', () => {
    const node = getSelected();
    if (!node) return;
    const parent = node.parent_id ? getNode(node.parent_id) : null;
    deleteNode(node.id);
    if (parent?.type === 'object') {
        spriteOptions(parent);
    }
    closeNodeInspector();
    renderUI();
});

close_inspector_button.addEventListener('click', () => {
    closeNodeInspector();
    selected_node_id = null;
    renderUI();
});

renderUI();

function addNode(type) {
    const selected = getSelected();

    if (selected && childAcceptable(selected.type, type)) {
        const node = createNode(type, selected.id);
        if (node) {
            selectNode(node.id);

            const parent = node.parent_id ?getNode(node.parent_id) : null;
            if (parent?.type === 'object') {
                spriteOptions(parent);
            }
        }
        return node;
    }

    if (selected && selected.parent_id && childAcceptable(getNode(selected.parent_id).type, type)) {
        const node = createNode(type, selected.parent_id);
        if (node) {
            selectNode(node.id);

            const parent = node.parent_id ?getNode(node.parent_id) : null;
            if (parent?.type === 'object') {
                spriteOptions(parent);
            }
        }
        return node;
    }

    if (type === 'group' || type === 'object') {
        const node = createNode(type, null);
        if (node) {
            selectNode(node.id);

            const parent = node.parent_id ?getNode(node.parent_id) : null;
            if (parent?.type === 'object') {
                spriteOptions(parent);
            }
        }
        return node;
    }

    console.warn(`Select an object first to add a ${type} to it`);
    return null;
}