# CoCreate Position

Declarative DOM positioning, dragging, snapping, and drag-and-drop for web
interfaces. Configure interactions with HTML attributes, or use the positioning
API from JavaScript. Position loads its drag, snap, and placement features on
demand when their attributes are used.

[Documentation and demo](https://cocreate.app/docs/position) ·
[GitHub repository](https://github.com/CoCreateJS/CoCreate-position)

![Minified size](https://img.badgesize.io/https://cdn.cocreate.app/position/latest/CoCreate-position.min.js?style=flat-square&label=minified&color=orange)
![Gzip size](https://img.badgesize.io/https://cdn.cocreate.app/position/latest/CoCreate-position.min.js?compression=gzip&style=flat-square&label=gzip&color=yellow)
![GitHub release](https://img.shields.io/github/v/release/CoCreateJS/CoCreate-position?style=flat-square)
![License](https://img.shields.io/github/license/CoCreateJS/CoCreate-position?style=flat-square)

![CoCreate Position demo](https://cdn.cocreate.app/docs/CoCreate-position.gif)

## Install

### CDN

```html
<link rel="stylesheet" href="https://cdn.cocreate.app/position/latest/CoCreate-position.min.css">
<script src="https://cdn.cocreate.app/position/latest/CoCreate-position.min.js"></script>
```

### npm

```sh
npm install @cocreate/position
```

### Yarn

```sh
yarn add @cocreate/position
```

The JavaScript entry imports Position's stylesheet. If your bundler extracts
CSS, make sure the generated stylesheet is included in your page.

## Overlay a box on a target

Use `position-query` to select the target and `position-element` to select the
overlay box. `position-events` lists the events that update the box; listeners
are attached directly to the element carrying these attributes:

```html
<button
  position-events="click"
  position-query="$this"
  position-element="$top #target-box">
  Show target box
</button>

<div id="target-box" class="target-box" hidden></div>
```

Position sets the box's `left`, `top`, `width`, and `height` to match the
queried target. It includes the target's margins. The box is shown and hidden
with the native `hidden` attribute; Position does not set `display`. Style the
box with CSS and give it `position: fixed` or `position: absolute` so its
coordinates apply.

By default, the box matches the target element. Set `position-box="text"` to
size it to the target's complete rendered text, including wrapped lines:

```html
<div
  position-events="mouseover, mousemove, mouseout"
  position-query="*:hover[]"
  position-element="$top #text-box"
  position-box="text">
  <h2>A heading to inspect</h2>
  <p>The text box follows all rendered lines.</p>
</div>

<div id="text-box" class="target-box" hidden></div>
```

Set `box-sizing: border-box` when the overlay's outside edges should match the
measured box. Other CSS, including borders, padding, and child controls, can
style or extend the overlay.

When the box is shown, its `position` object exposes the active trigger, event,
query matches, target, and measured box. Relayed iframe events keep both the
inner event target and the iframe relay target available:

```js
toolbar.position.trigger; // element with position-query and position-events
toolbar.position.event.target; // original target, including inside an iframe
toolbar.position.event.relayTarget; // iframe element, when relayed
toolbar.position.element; // active matched element or selection range
toolbar.position.queryElements; // all query matches
toolbar.position.box.rect; // { top, right, bottom, left, width, height, x, y }
```

Events relay from same-origin iframe documents through the iframe element, so a
position query element that contains the iframe can listen on its own event
path just as it would for content in the same document. Cross-origin iframe
contents remain subject to browser security boundaries.

For a text selection inside a same-origin iframe, listen to the relayed native
`selectionchange` event and query `$selection`:

```html
<div
  position-events="selectionchange"
  position-query="iframe $selection"
  position-element="$top #selection-box"
  position-box="text"></div>
```

The target box also receives a JavaScript `position` API when initialized:

```js
box.position.place(anchor, { box: "text" });
box.position.unplace();
```

## Drag elements

Add `draggable` to let a user move an element directly:

```html
<div draggable>Drag me</div>
```

For scoped move or clone operations, put the source query and drop query on a
shared container. A `clonable-query` takes precedence if both source queries
match:

```html
<section
  draggable-query=".card[]"
  clonable-query=".copy-card[]"
  droppable-query=".board[]"
>
  <div class="board">Drop zone</div>
  <article class="card">Move this card</article>
  <article class="copy-card">Clone this card</article>
</section>
```

`draggable-query` moves the matching source; `clonable-query` leaves the source
in place and inserts a deep clone. If the pointer is not over a matching drop
target, the operation is canceled. Drop targets can be selected across
same-origin iframe documents using CoCreate query operators.

`draggable-value` and `clonable-value` let a source provide a custom drop value.
Position inserts an element value as an element and a string value as HTML. A
custom `draggable-value` is removed from its source after a successful drop;
`clonable-value` leaves its source in place.

## Auto-scroll while dragging

Active drags automatically scroll when the pointer enters the visible top or
bottom edge of a scrollable container. No additional attributes are required.
The auto-scroll module loads on the first confirmed drag, and continues
scrolling while the pointer stays at the edge, even without further movement.

The edge zone is up to 48 pixels deep. Speed increases toward the edge, up to
800 CSS pixels per second. Nested containers scroll from the inside outward;
an outer container takes over at an inner container's limit when the pointer
is also near its edge. Viewport scrolling and same-origin iframe drop
containers use the same behavior.

Drop references, insertion markers, and drag previews refresh after scrolling.
Scrolling stops when the pointer leaves the edge, the drag ends or is canceled,
the window loses focus, or the dragged element is removed.

## Snap to containers and inspect insertion points

Use `snappable-query` to select snap destinations independently of
`droppable-query`:

```html
<div draggable snappable-query="$top .snap-area[]">Drag into a snap area</div>
<div class="snap-area"></div>
```

After a successful snap, the moved element receives the `snapped` attribute.
For drag-and-drop insertion feedback, add `position-reference` to the source
scope. Position emits `element-position-reference` with a `detail.reference`
object containing the hovered element, container, insertion position, pointer
coordinates, and owning document. The active drop container temporarily
receives `droppable`; a `position-marker` preview shows the insertion point.

During dragging, Position applies `position-moving` to a moved element or
`position-cloning` to a clone source. The pointer-following preview uses
`position-moving-preview`. These classes and the marker can be styled by the
application; default styles are included in the package CSS.

The current hovered node is also exposed as `document.hoveredElement` and
`document.documentElement.hoveredElement`. For same-origin iframe targets, the
frame document exposes its inner hovered node, while the parent document
continues to expose the iframe element.

## Links

- [Documentation and demo](https://cocreate.app/docs/position)
- [Changelog](https://github.com/CoCreateJS/CoCreate-position/blob/main/CHANGELOG.md)
- [Issues](https://github.com/CoCreateJS/CoCreate-position/issues)
- [Contributing](https://github.com/CoCreateJS/CoCreate-position/blob/main/CONTRIBUTING.md)
- [MIT license](https://github.com/CoCreateJS/CoCreate-position/blob/main/LICENSE)

## About

CoCreate Position is maintained by [CoCreate](https://cocreate.app). Questions
can be sent to [develop@cocreate.app](mailto:develop@cocreate.app).
