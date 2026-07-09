const valid_children = {
    group: ['group', 'object'],
    object: ['sprite', 'audio', 'script'],
    sprite: [],
    audio: [],
    script: []
};

const node_icons = {
    group:  'G:',
    object: 'O:',
    sprite: 'S:',
    audio:  'A:',
    script: 'C:'
}

let next_node_id = 1;

const hierarchy_nodes = new Map();
const hierarchy_roots = [];

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
const node_audio_loop = document.getElementById('node-audio-loop');

const node_script_fields = document.getElementById('node-script-fields');
const node_script_code = document.getElementById('node-script-code');

const node_delete_button = document.getElementById('node-delete');
const asset_select_panel = document.getElementById('asset-select');
const close_inspector_button = document.getElementById('close-inspector');

function makeNodeID() {
    return 'node_' + (next_node_id++);
}

function defaultNameFor(type) {
    const count = [...hierarchy_nodes.values()].filter(n => n.type === type).length + 1;
    const labels = {group: 'Group', object: 'Object', sprite: 'Sprite', audio: 'Audio', script: 'Script'};
    return `${labels[type]} ${count}`;
}

function childAcceptable(parent_type, child_type) {
    return valid_children[parent_type]?.includes(child_type) ?? false;
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
    const node = {id, type, name: name || defaultNameFor(type), parent_id, child_ids: []};

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

function reparentNode(id, new_parent_id) {
    const node = hierarchy_nodes.get(id);
    if (!node) return false;

    if (new_parent_id) {
        const new_parent = hierarchy_nodes.get(new_parent_id);
        if (!new_parent || !childAcceptable(new_parent.type, node.type)) return false;
        if (id === new_parent_id || isDescendant(new_parent_id, id)) return false;
    } else if (node.type !== 'group' && node.type !== 'object') {
        return false;
    }

    if (node.parent_id) {
        const old_parent = hierarchy_nodes.get(node.parent_id);
        if (old_parent) old_parent.child_ids = old_parent.child_ids.filter(cid => cid !== id);
    } else {
        const index = hierarchy_roots.indexOf(id);
        if (index !== -1) hierarchy_roots.splice(index, 1);
    }

    node.parent_id = new_parent_id;
    if (new_parent_id) {
        hierarchy_nodes.get(new_parent_id).child_ids.push(id);
    } else {
        hierarchy_roots.push(id);
    }

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

    if (id === selected_node_id) {
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
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.classList.add('hierarchy-node-dragover');
    });

    row.addEventListener('dragleave', () => {
        row.classList.remove('hierarchy-node-dragover');
    });

    row.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove('hierarchy-node-dragover');

        const dragged_id = e.dataTransfer.getData('text/plain');
        if (!dragged_id || dragged_id === id) return;

        const moved = reparentNode(dragged_id, id);
        if (!moved) {
            console.warn(`Can't move that node onto a ${node.type}`);
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
        node_audio_volume.value = node.volume;
        node_audio_loop.checked = node.loop;
    } else if (node.type === 'script') {
        node_script_code.value = node.code;
    }

    if (typeof showScriptError === 'function') {
        showScriptError(node.type === 'script' ? node : null);
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
});

node_audio_loop.addEventListener('change', () => {
    const node = getSelected();
    if (!node || node.type !== 'audio') return;
    node.loop = node_audio_loop.checked;
});

node_script_code.addEventListener('input', () => {
    const node = getSelected();
    if (!node || node.type !== 'script') return;
    node.code = node_script_code.value;
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