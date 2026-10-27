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

## Place an element relative to a target

Use `position-query` to select the anchor and `position-element` to select the
floating element. Put these attributes on the trigger or container that owns
the interaction:

```html
<button
  position-query="$this"
  position-element="$top #popover"
  position="bottom left"
  position-offset="8"
>
  Open popover
</button>

<div id="popover" hidden>Popover content</div>
```

Position resolves both queries when the trigger is activated. If
`position-query` is omitted, the trigger is the anchor. Placement can be
`top`, `bottom`, `left`, or `right`, with `start`, `center`, or `end` alignment
(for example, `top right`). `position-offset` controls the gap from the anchor;
`position-padding` sets the collision boundary inset; and
`position-collision="flip shift"` controls collision handling. The defaults
are an 8px offset and padding, with flipping and shifting enabled.

The floating element also receives a JavaScript `position` API when initialized:

```js
popover.position.place(anchor, { position: "bottom-start", offset: 8 });
popover.position.unplace();
```

## Follow hovered elements

Add `:hover` to the anchor query to position a toolbar or popup against the
deepest hovered match:

```html
<div
  position-query="*:hover[]"
  position-element="$top #format-toolbar"
  position="top left"
>
  <!-- content to inspect -->
</div>
<div id="format-toolbar" hidden>Formatting actions</div>
```

For a same-origin iframe, query its document with `$contentDocument`:

```html
<iframe
  position-query="$contentDocument *:hover[]"
  position-element="$top #format-toolbar"
></iframe>
```

Position tracks pointer movement inside same-origin frames and maps the target
geometry into the parent document. Cross-origin frame contents cannot be
queried by the parent page due to browser security boundaries.

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
