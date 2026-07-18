// this is honestly getting very messy and it's getting hard to keep track of things lol, i should've split this into multiple files
// this is me, 5 days later. should i still split this file up? i think this is fine rn
const add_hierarchy = document.getElementById('add-hierarchy');
const hierarchy_dropdown_content = document.getElementById('hierarchy-dropdown-content');
let dropdown_open = false;

const canvas = document.getElementById('matu-canvas');
const context = canvas.getContext('2d');
const world_width = 800;
const world_height =  400;
const viewport = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,

    update() {
        const scaleX = canvas.clientWidth / world_width;
        const scaleY = canvas.clientHeight / world_height;
        this.scale = Math.min(scaleX, scaleY);
        this.offsetX = (canvas.clientWidth - world_width * this.scale) / 2;
        this.offsetY = (canvas.clientHeight - world_height * this.scale) / 2;
    }
};
const scene_state = {bg_color: '#101014'};

const preview_window = document.getElementById('preview-window');
const preview_image = document.getElementById('preview-image');
const preview_header = document.getElementById('preview-header');
const preview_file = document.getElementById('preview-file');
const close_preview = document.getElementById('close-preview');

const preview_windows = new Map();
let max_z = 100;
let preview_index = 0;

const add_asset = document.getElementById('add-assets');
const asset_input = document.getElementById('asset-input');
const asset_list = document.getElementById('asset-list');
const asset_select = document.getElementById('asset-select');

let asset_names = new Set();
let asset_files = new Map();
let asset_tiles = new Map();
let asset_images = new Map(); 
let asset_urls = new Map();

const inspector_thumb = document.getElementById('inspector-thumb');
const inspector_filename = document.getElementById('inspector-filename');
const inspector_extension = document.getElementById('inspector-extension');
const inspector_rename = document.getElementById('inspector-rename');
const inspector_save = document.getElementById('inspector-save');
const close_inspector = document.getElementById('close-inspector');

const inspector_x = document.getElementById('inspector-x');
const inspector_y = document.getElementById('inspector-y');
const inspector_w = document.getElementById('inspector-width');
const inspector_h = document.getElementById('inspector-height');
let selected_object = null;

// hierarchy dropdown
add_hierarchy.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown_open) {
        hierarchy_dropdown_content.classList.remove('open');
        dropdown_open = false;
        return;
    }
    hierarchy_dropdown_content.classList.add('open');
    dropdown_open = true;
});

document.addEventListener('click', () => {
    hierarchy_dropdown_content.classList.remove('open');
    dropdown_open = false;
});

hierarchy_dropdown_content.addEventListener('click', (e) => {
    e.stopPropagation();
});

const label_to_hierarchy = {
    'Group': 'group',
    'Object': 'object',
    'Sprite': 'sprite',
    'Audio': 'audio',
    'Script': 'script'
};

hierarchy_dropdown_content.querySelectorAll('button').forEach(button => {
    const type = label_to_hierarchy[button.textContent.trim()];
    if (!type) return;

    button.addEventListener('click', () => {
        addNode(type);
        hierarchy_dropdown_content.classList.remove('open');
        dropdown_open = false;
    });
});

// draw viewport grid
function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}

resizeCanvas();

function drawGrid() {
    const grid_size = 20;

    context.strokeStyle = '#2c2c33';
    context.lineWidth = 1 / viewport.scale;

    for (let x = 0; x < world_width; x += grid_size) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, world_height);
        context.stroke();
    }

    for (let y = 0; y < world_height; y += grid_size) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(world_width, y);
        context.stroke();
    }

    context.beginPath();
    context.moveTo(world_width, 0);
    context.lineTo(world_width, world_height);
    context.stroke();
}

function drawScene() {
    for (const {object_node, sprite_node} of getRenderables()) {
        drawObject(object_node, sprite_node);
    }
}

function getAssetImage(name) {
    if (asset_images.has(name)) {
        return asset_images.get(name);
    }

    const file = asset_files.get(name);
    if (!file) return null;

    const img = new Image();
    img.src = URL.createObjectURL(file);
    asset_images.set(name, img);

    return null; 
}

function getAssetURL(name) {
    if (asset_urls.has(name)) return asset_urls.get(name);
    const file = asset_files.get(name);
    if (!file) return null;
    const url = URL.createObjectURL(file);
    asset_urls.set(name, url);
    return url;
}

function drawObject(object_node, sprite_node) {
    if (!sprite_node) return;

    const img = getAssetImage(sprite_node.asset_name);
    if (!img || !img.complete) return;

    const {x, y, width, height, rotation} = object_node.transform;
    const opacity = sprite_node.opacity ?? 1;

    context.save();
    context.globalAlpha = opacity;

    if (!rotation) {
        context.drawImage(img, x, y, width, height);
        context.restore();
        return;
    }

    context.translate(x + width / 2, y + height / 2);
    context.rotate(rotation);
    context.drawImage(img, -width / 2, -height / 2, width, height);
    context.restore();
}

function screenToWorld(e) {
    const rect = canvas.getBoundingClientRect();

    const x = (e.clientX - rect.left - viewport.offsetX) / viewport.scale;
    const y = (e.clientY - rect.top - viewport.offsetY) / viewport.scale;

    return {x, y};
}

function render() {
    viewport.update();

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = scene_state.bg_color;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.translate(viewport.offsetX, viewport.offsetY);
    context.scale(viewport.scale, viewport.scale);

    drawGrid();
    drawScene();
    requestAnimationFrame(render);
}

render();

// get unique name for each asset
function getName(name) {
    if (!asset_names.has(name)) return name;

    let base = name;
    let extension = '';

    const dot_index = name.lastIndexOf('.');
    if (dot_index !== -1) {
        base = name.substring(0, dot_index);
        extension = name.substring(dot_index);
    }

    let counter = 1;
    let new_name = `${base}(${counter})${extension}`;

    while (asset_names.has(new_name)) {
        counter++;
        new_name = `${base}(${counter})${extension}`;
    }

    return new_name;
}

// shorten file name
function shortenName(name, max_length = 14) {
    const dot_index = name.lastIndexOf('.');
    const extension = dot_index !== -1 ? name.slice(dot_index) : '';
    const base = dot_index !== -1 ? name.slice(0, dot_index) : name;

    if (name.length <= max_length) return name;

    const keep = max_length - extension.length - 3;
    const start = Math.ceil(keep / 2);
    const end = Math.floor(keep / 2);

    return base.slice(0, start) + '...' + base.slice(base.length - end) + extension;
}

add_asset.addEventListener('click', () => {
    asset_input.click();
});

function openInspector(name, ext) {
    closeNodeInspector();
    selected_node_id = null;
    renderUI();

    asset_select.style.display = 'flex';
    close_inspector.classList.add('show');
    const file = asset_files.get(name);
    if (!file) {
        console.warn('No file found for ', name);
        return;
    }
    const tile = asset_tiles.get(name);

    if (file.type.startsWith('image/')) {
        inspector_thumb.src = URL.createObjectURL(file);
    } else if (file.type.startsWith('audio/')) {
        inspector_thumb.src = '';
        inspector_thumb.alt = 'audio file';
    } else {
        inspector_thumb.src = '';
        inspector_thumb.alt = 'file';
    }

    inspector_filename.textContent = name;
    inspector_extension.textContent = 'File type: ' + ext;
    inspector_rename.value = name;

    inspector_save.onclick = () => {
        const current_name = inspector_filename.textContent;
        renameAsset(current_name);
    };
}

function updateInspector(obj) {
    if (!inspector_x || !inspector_y || !inspector_w || !inspector_h) return;
    inspector_x.value = obj.x;
    inspector_y.value = obj.y;
    inspector_w.value = obj.width;
    inspector_h.value = obj.height;
}

if (inspector_x) {
    inspector_x.oninput = (e) => {
        if (!selected_object) return;
        selected_object.x = Number(e.target.value);
    };
}

function closeInspector(item, remove_item) {
    asset_select.style.display = 'none';
    close_inspector.classList.remove('show');
    item.classList.remove(remove_item);
}

close_inspector.addEventListener('click', () => {
    const selected_tile = document.querySelector('.asset-selected');
    if (selected_tile) {
        closeInspector(selected_tile, 'asset-selected');
    } else {
        asset_select.style.display = 'none';
        close_inspector.classList.remove('show');
    }
});

function openPreview(name) {
    if (preview_windows.has(name)) {
        const preview = preview_windows.get(name);

        centerWindow(preview);

        preview.style.display = 'flex';
        bringToFront(preview);

        return;
    }

    const file = asset_files.get(name);
    if (!file) {
        console.warn('No file found for ', name);
        return;
    }

    const preview = document.createElement('div');

    preview.style.display = 'flex';
    preview.className = 'preview-window';

    preview.innerHTML = `
        <div class="preview-window-header panel-header">
            <h1 class="preview-header">Preview</h1>
            <p class="preview-file">${shortenName(name)}</p>
            <button class="close-preview close-button">x</button>
        </div>
    `;

    const header = preview.querySelector('.preview-window-header');
    const close = preview.querySelector('.close-preview');

    let content = null;

    if (file.type.startsWith('image/')) {
        content = document.createElement('img');
        content.className = 'preview-image';
        content.src = URL.createObjectURL(file);

        content.onload = () => {
            centerWindow(preview);
        };
    } else if (file.type.startsWith('audio/')) {
        content = document.createElement('audio');
        content.className = 'preview-audio';
        content.controls = true;
        content.src = URL.createObjectURL(file);

        content.onloadedmetadata = () => {
            centerWindow(preview);
            content.play().catch(() => {});
        };
    } else {
        content = document.createElement('div');
        content.className = 'preview-unsupported';
        content.textContent = 'No preview available';
        centerWindow(preview);
    }

    preview.appendChild(content);

    document.getElementById('center').appendChild(preview);

    dragElement(preview, header);
    bringToFront(preview);

    preview_windows.set(name, preview);

    close.onclick = () => {
        closePreview(preview, name);
    };

    function centerWindow(preview) {
        const parent = document.getElementById("center");

        const centerX = (parent.clientWidth - preview.offsetWidth) / 2;
        const centerY = (parent.clientHeight - preview.offsetHeight) / 2;

        const offsets = [
            {x: 0,  y: 0},
            {x: 30, y: 30},
            {x: 60, y: 15},
            {x: 15, y: 60}
        ];

        const offset = offsets[preview_index];
        preview_index = (preview_index + 1) % offsets.length;
        preview.style.left = centerX + offset.x + "px";
        preview.style.top  = centerY + offset.y + "px";
    }
}

function closePreview(preview, name) {
    const audio = preview.querySelector('audio');
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }

    preview_windows.delete(name);
    preview.remove();
}

// arigato w3 schools

function dragElement(element, handle=element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.addEventListener('mousedown', dragMouseDown);

    function dragMouseDown(e) {
        e.preventDefault();

        bringToFront(element);

        pos3 = e.clientX;
        pos4 = e.clientY;

        document.addEventListener('mousemove', elementDrag);
        document.addEventListener('mouseup', stopDrag);
    }

    function elementDrag(e) {
        e.preventDefault();

        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        element.style.left = element.offsetLeft - pos1 + 'px';
        element.style.top = element.offsetTop - pos2 + 'px';
    }

    function stopDrag() {
        document.removeEventListener('mousemove', elementDrag);
        document.removeEventListener('mouseup', stopDrag);
    }
}

function bringToFront(window) {
    window.style.zIndex = ++max_z;
}

function renameAsset(old_name) {
    let new_name_raw = inspector_rename.value.trim();
    if (!new_name_raw) {
        return;
    }

    const dot_index = old_name.lastIndexOf('.');
    const original_extension = dot_index !== -1 ? old_name.slice(dot_index) : '';

    if (!new_name_raw.endsWith(original_extension)) {
        new_name_raw += original_extension;
    }

    if (new_name_raw === old_name) {
        return;
    }

    const new_name = getName(new_name_raw);

    const file = asset_files.get(old_name);
    const tile = asset_tiles.get(old_name);

    tile.dataset.name = new_name;

    asset_files.delete(old_name);
    asset_tiles.delete(old_name);

    asset_files.set(new_name, file);
    asset_tiles.set(new_name, tile);

    if (asset_images.has(old_name)) {
        asset_images.set(new_name, asset_images.get(old_name));
        asset_images.delete(old_name);
    }

    asset_names.delete(old_name);
    asset_names.add(new_name);

    const label = tile.querySelector('.asset-label');
    label.textContent = shortenName(new_name);

    inspector_filename.textContent = new_name;

    if (preview_windows.has(old_name)) {
        const preview = preview_windows.get(old_name);

        const preview_file = preview.querySelector('.preview-file');
        preview_file.textContent = shortenName(new_name);

        preview_windows.delete(old_name);
        preview_windows.set(new_name, preview);
    }

    refreshAssets();
}

function refreshAssets() {
    const selected = getSelected();
    if (!selected) return;

    if (selected.type === 'sprite') {
        assetOptions(node_sprite_asset, 'image/', selected.asset_name);
    } else if (selected.type === 'audio') {
        assetOptions(node_audio_asset, 'audio/', selected.asset_name);
    }
}

// upload assets
asset_input.addEventListener('change', () => {
    const files = Array.from(asset_input.files);

    files.forEach(file => {
        const unique_name = getName(file.name);
        asset_names.add(unique_name);

        const item = document.createElement('div');
        item.classList.add('asset-item');

        let thumbnail;
        if (file.type.startsWith('image/')) {
            thumbnail = document.createElement('img');
            thumbnail.classList.add('asset-thumb');
            thumbnail.src = URL.createObjectURL(file);
        } else if (file.type.startsWith('audio/')) {
            thumbnail = document.createElement('div');
            thumbnail.classList.add('asset-audio-thumb');
            thumbnail.textContent = '🎵';
        } else {
            thumbnail = document.createElement('div');
            thumbnail.classList.add('asset-generic-thumb');
            thumbnail.textContent = '📄';
        }

        // delete
        const delete_button = document.createElement('button');
        delete_button.classList.add('delete-asset');
        delete_button.textContent = 'x';
        delete_button.addEventListener('click', (e) => {
            e.stopPropagation();

            const current_name = item.dataset.name;

            if (preview_windows.has(current_name)) {
                const preview = preview_windows.get(current_name);
                closePreview(preview, current_name);
            }

            asset_list.removeChild(item);
            asset_names.delete(current_name);
            asset_files.delete(current_name);
            asset_tiles.delete(current_name);
            asset_images.delete(current_name);

            const belongs_to_asset = asset_select.style.display !== 'none' && inspector_filename.textContent === current_name;

            if (belongs_to_asset) {
                closeInspector(item, 'asset-item');
            }

            refreshAssets();
        });

        const label = document.createElement('div');
        label.classList.add('asset-label');
        label.textContent = shortenName(unique_name);

        item.appendChild(thumbnail);
        item.appendChild(label);
        item.appendChild(delete_button);
        item.dataset.name = unique_name;
        asset_list.appendChild(item);

        asset_files.set(unique_name, file);
        asset_tiles.set(unique_name, item);

        refreshAssets();

        // asset select
        item.addEventListener('click', () => {
            asset_tiles.forEach(tile => tile.classList.remove('asset-selected'));
            item.classList.add('asset-selected');

            const current_name = item.dataset.name;

            const dot_index = current_name.lastIndexOf('.');
            const ext = current_name.substring(dot_index);
            openInspector(current_name, ext);
        });

        // preview
        item.addEventListener('dblclick', () => {
            asset_tiles.forEach(tile => tile.classList.remove('asset-selected'));
            item.classList.add('asset-selected');

            const current_name = item.dataset.name;
            openPreview(current_name);
        });
    });

    asset_input.value = "";
});
