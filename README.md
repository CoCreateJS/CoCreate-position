# CoCreate-position

Make any element draggable and movable. Customizable via HTML5 attributes or Javascript, great for creating moveable popups, alerts, etc. Take it for a spin in our [playground!](https://cocreate.app/docs/position)

![minified](https://img.badgesize.io/https://cdn.cocreate.app/position/latest/CoCreate-position.min.js?style=flat-square&label=minified&color=orange)
![gzip](https://img.badgesize.io/https://cdn.cocreate.app/position/latest/CoCreate-position.min.js?compression=gzip&style=flat-square&label=gzip&color=yellow)
![brotli](https://img.badgesize.io/https://cdn.cocreate.app/position/latest/CoCreate-position.min.js?compression=brotli&style=flat-square&label=brotli)
![GitHub latest release](https://img.shields.io/github/v/release/CoCreate-app/CoCreate-position?style=flat-square)
![License](https://img.shields.io/github/license/CoCreate-app/CoCreate-position?style=flat-square)
![Hiring](https://img.shields.io/static/v1?style=flat-square&label=&message=Hiring&color=blueviolet)

![CoCreate-position](https://cdn.cocreate.app/docs/CoCreate-position.gif)

## [Docs & Demo](https://cocreate.app/docs/position)

For a complete guide and working demo refer to the [doumentation](https://cocreate.app/docs/position)

## CDN

```html
<script src="https://cdn.cocreate.app/position/latest/CoCreate-position.min.js"></script>
```

```html
<script src="https://cdn.cocreate.app/position/latest/CoCreate-position.min.css"></script>
```

## NPM

```shell
$ npm i @cocreate/position
```

## yarn

```shell
$ yarn install @cocreate/position
```

# Table of Contents

- [Table of Contents](#table-of-contents)
- [Announcements](#announcements)
- [Roadmap](#roadmap)
- [How to Contribute](#how-to-contribute)
- [About](#about)
- [License](#license)

<a name="announcements"></a>

# Announcements

All updates to this library are documented in our [CHANGELOG](https://github.com/CoCreate-app/CoCreate-position/blob/master/CHANGELOG.md) and [releases](https://github.com/CoCreate-app/CoCreate-position/releases). You may also subscribe to email for releases and breaking changes.

<a name="roadmap"></a>

# Roadmap

If you are interested in the future direction of this project, please take a look at our open [issues](https://github.com/CoCreate-app/CoCreate-position/issues) and [pull requests](https://github.com/CoCreate-app/CoCreate-position/pulls). We would love to hear your feedback.

## Programmatic positioning targets

Add `position-query` to the element that should be positioned. Its query selects
the anchor; placement settings are read from the positioned element, with the
anchor as a fallback:

```html
<button id="anchor">Anchor</button>
<div position-query="$top #anchor" position="top right">Positioned element</div>
```

The query is resolved when the element is added and whenever `position-query`
changes. The positioned element initializes itself; no trigger button or
`position-anchor-query` is needed. `position-target` remains available for
elements positioned directly through `element.position.place(anchor)`.

## Moving and container drag and drop

`draggable` lets an element move freely. For container drag and drop, place
`draggable-query` or `clonable-query`
and `droppable-query` together on a parent scope. The source query selects
descendants that can be moved or cloned; the drop query selects their allowed
destinations. A scope can define both source queries. If an element matches both,
`clonable-query` takes precedence. Queries support CoCreate operators, including
same-origin iframe traversal.

A directly draggable element can also define `droppable-query` itself, or inherit
the closest ancestor's `droppable-query`:

```html
<div draggable droppable-query="$top .snap-area[]">Move me into a snap area</div>
```

```html
<div draggable-query=".card" droppable-query="$top .board[]">
    <div class="card">A card</div>
</div>
```

`draggable-query` moves the matched source element. `clonable-query` leaves the
source in place and inserts a deep clone. If no matching drop target is under
the pointer, the operation is canceled. A matching container with no element
children uses `afterbegin`; otherwise insertion is `beforebegin` or `afterend`
relative to a direct child.

Add `draggable-value` or `clonable-value` to a matched source to provide a custom
drop value. Position resolves the attribute on drop: an element value is
inserted as an element, and a string value is inserted as HTML. Without a custom
value, Position moves or clones the source element according to its query. When
`draggable-value` supplies a different value, the source is removed after a
successful drop; a `clonable-value` leaves its source in place.

Add `position-reference` to expose the element and insertion point under the
pointer while moving. Listen for `element-position-reference`; its
`detail.reference` contains the referenced `element`, its `container` when
scoped, the insertion position, pointer coordinates, and the owning document.
Position clears the reference when the pointer leaves all matching containers.
The matching container receives a temporary `position-container` attribute
while active; Position moves that attribute to the newly hovered container and
removes it when the interaction ends.
Position also inserts an empty `position-marker` element at the current
insertion point. It uses the moving element's width and height, follows changes
to the reference, and is removed when the drag ends.
The hovered element is also available as `document.hoveredElement` and
`document.documentElement.hoveredElement`. In a same-origin iframe, those
properties refer to the element inside the frame, and the iframe element's
`hoveredElement` property refers to that same inner element. In the parent
document, the hovered element remains the iframe itself.

## Drag preview

While an element is moving, Position adds the `position-moving` class and moves
a visual preview that follows the pointer. The original element is hidden during
the drag and restored on release. Style `.position-moving` or
`.position-moving-preview` to control the moving preview's appearance. This drag
preview is separate from both the snap preview and the `position-marker` used to
show the insertion point.

<a name="about"></a>

# About

CoCreate-position is guided and supported by the CoCreate Developer Experience Team.

Please Email the Developer Experience Team [here](mailto:develop@cocreate.app) in case of any queries.

CoCreate-position is maintained and funded by CoCreate. The names and logos for CoCreate are trademarks of CoCreate, LLC.

<a name="contribute"></a>

# How to Contribute

We encourage contribution to our libraries (you might even score some nifty swag), please see our [CONTRIBUTING](https://github.com/CoCreate-app/CoCreate-position/blob/master/CONTRIBUTING.md) guide for details.

We want this library to be community-driven, and CoCreate led. We need your help to realize this goal. To help make sure we are building the right things in the right order, we ask that you create [issues](https://github.com/CoCreate-app/CoCreate-position/issues) and [pull requests](https://github.com/CoCreate-app/CoCreate-position/pulls) or merely upvote or comment on existing issues or pull requests.

We appreciate your continued support, thank you!


<a name="license"></a>
# License

[The MIT License (MIT)](https://github.com/CoCreate-app/CoCreate-position/blob/master/LICENSE)
