
---

# matuscript API docs

Scripting in matu is done with Javascript. Scripts run in `script` nodes and can define any of these top-level functions:

| Function | Called when |
|---|---|
| `start(owner, matu)` | Once, when a run starts |
| `update(owner, matu, dt)` | Every frame, `dt` being the number of seconds since the last frame |
| `end(owner, matu)` | Once, when a run ends |
| `OnClone(owner, matu, original)` | On a cloned script, right after a clone's `start` runs. `original` is the source node of the clone |
| `OnDestroy(owner, matu)` | On a script and its descendants, right before `matu.destroy()` removes them |

`owner` is the parent node that the script is attached to, and `matu` is the API object.

---

## Node lookup

### `matu.getNode(name)`
Finds a node by name. Prefix the node name with its type letter and a colon (`G:` group, `O;` object, `S:` sprite, `A;` audio, `C:` scipt). For example, to get an `object` named Player, run `matu.getNode('O:Player')`. Without a prefix, `getNode` will match any node with that name. It will return `null` if not found.

### `matu.getNodeByID(id)`
Finds a node by its internal id. It will return `null` if not found.

---

## Spawning, cloning, and destroying

### `matu.spawn(type, parent_id, name)`
Creates a new node of `type` (`'group', 'object', 'sprite', 'audio', or 'script'`) under `parent_id`. `name` is optional. Compiles and runs `start()` on any script nodes in the new node (itself or its children). Returns the new node, or `null` if the creation filed (such as an invalid parent/child combo). 

### `matu.clone(node, parent_override_id?)`
Deep-cloens `node` and its entire subtree (such as transform, sprite/audio settings, and the script code is all copied). By default, the clone is placed under the same parent. Pass `parent_override_id` to place it elsewhere (or `null` to place it in the root). It compiles and runs `start()`, then `OnClone(owner, matu, original)`, on every script in the cloned subtree. It returns the clone. 

### `matu.destroy(node)`
Runs `OnDestroy(owner, matu)` on `node` and every script in its subtree, then removes the node and its children entirely. Use this instead of discarding a reference. Normal JS garbage collection won't remove it from the scene. 

---

## Input

### `matu.input.isDown(key)`
Returns `true` if `key` is currently held down. It is case-insensitive (for example, `matu.input.isDown('a')`, `matu.input.isDown('ArrowUp')`).

---

## Logging

### `matu.log(...args)`
Logs the arguments in both the browser console and the in-editor console panel. It accepts any number of arguments. The objects are JSON-stringified. 

---

## Object (`matu.object`)

Only works on `object` nodes.

| Function | Effect |
|---|---|
| `setPosition(node, x, y)` | Sets absolute position |
| `move(node, dx, dy)` | Adds `dx, dy` to the current position |
| `setRotation(node, degrees)` | Sets absolute rotation in degrees |
| `rotate(node, degrees_delta)` | Adds `degrees_delta` to the current rotation |
| `setSize(node, width, height)` | Sets the absolute width/height |
| `setSprite(node, sprite)` | Sets which sprite child node is displayed. You can pass a sprite node, or `null` for auto-selection |
| `getSprite(node)` | Returns the sprite node being displayed (explicit or auto-selected) or `null` |

These functions will all silently not function is `node` is missing or if it is not an `object`.

---

## Sprite (`matu.sprite`)

Only works on `sprite` nodes. 

| Function | Effect |
|---|---|
| `setOpacity(node, value)` | Sets opacity, clamped to `0 - 1` |
| `setVisible(node, visible)` | Sets visibility (`true`/`false`) |
| `setAsset(node, asset_name)` | Swaps the sprite's image asset by name |

Sprite size is not a sprite property. Use `matu.object.setSize()` on the sprite's parent node instead.

---

## Audio (`matu.audio`)

Only works on `audio` nodes.

| Function | Effect |
|---|---|
| `play(node)` | Plays from the start, logs an error if no asset is assigned |
| `stop(node)` | Pauses and resets playback position to 0 |
| `pause(node)` | Pauses without resetting position |
| `resume(node)` | Resumes from current position |
| `isPlaying(node)` | Returns `true`/`false` |
| `setVolume(node, value)` | Sets volume, clamped to `0 - 1` |
| `setLoop(node, loop)` | Sets looping (`true`/`false`) |
| `setAsset(node, asset_name)` | Swaps the node's audio asset by name, and stops any current playback of the old asset |

All audio is automatically stopped when a run ends, so there is no need to clean it up in `end()`.

---

## Collision (`matu.physics`)

Only works on `object` nodes. Collision is rotation-aware, so a rotated object will collide correctly, not just its unrotated axis aligned bounds.

### `matu.physics.intersects(a, b)`
Returns `true` if the two object nodes` rectangles overlap, accounting for rotation.

### `matu.physics.getCollision(node)`
Returns an array of every other `object` node currently overlapping `node`.

---

## Global variables (`matu.globals`)

Shared key/value store across all scripts. They are cleared at the start of every run.

| Function | Effect |
|---|---|
| `set(key, value)` | Stores a value |
| `get(key, fallback?)` | Retrieves a value, or `fallback` default `null`) if unset |
| `has(key)` | Returns `true/false` |
| `delete(key)` | Removes a key |

---

## Scene (`matu.scene`)

### `matu.scene.setBackgroundColor(color)`
Sets the canvas background color (any valid CSS color string). It resets to its pre-run value when the run stops.

### `matu.scene.getBackgroundColor()`
Returns the current background color.

--- 

## Timers (`matu.timer`)

Timers pause automatically when the run stops and will not fire outside of a run.

### `matu.timer.after(seconds, callback)`
Runs `callback` once after `seconds` have elapsed. It returns a timer id.

### `matu.timer.every(seconds, callback)`
Runs `callback` repeatedly every `seconds`. It returns a timer id.

### `matu.timer.cancel(id)`
Cancels a pending or repeating timer by id.

---
