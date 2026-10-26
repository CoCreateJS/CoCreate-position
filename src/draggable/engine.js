import { dispatch } from "../helpers/events.js";
import { hasSelection } from "@cocreate/utils";

function position(el, container, options) {
    if (!(el && el.nodeType && el.nodeType === 1)) {
        return;
    }

    this.options = Object.assign({ draggable: true }, options);
    /** define constant **/
    this.MARGIN = 5;
    this.FULLSCREEN_MARGIN = -60;
    this.NO_SNAP = -100;
    this.SNAP_MARGIN = -10;
    this.RIGHT_SCROL = 5;
    this.dragHandle = el.querySelector('[drag-handle]')
    this.container = container;
    if (this.container && !this.container.positionIndex)
        this.container.positionIndex = 10

    this.el = el;
    this.boundStatus = {};

    this.selectedElement;
    // this.selectedClass = "selectedPosition";
    /**
     * x: mouse x in element
     * y: mouse y in element
     * cx: x in document
     * cy: y in document
     * */
    this.point = {};
    this.rect = {};
    this.clickedInfo = null;
    this.preSnapped = null;
    this.isSnap = false;
    this.reference = null;

    if (this.options.draggable) {
        this._createSnapGhost(this.container?.getAttribute("data-ghost-class"));
        this._initEvent();
        this._selectElement();
    }
}

const INTERACTIVE_SELECTOR = [
    "a",
    "button",
    "input",
    "select",
    "textarea",
    "label",
    "summary",
    "[contenteditable]:not([contenteditable='false'])",
    "[moveable-ignore]"
].join(",");

position.prototype = {
    constructor: position,

    _initEvent: function () {
        if (!this.eventsInitialized) {
            this.eventsInitialized = true;
            const self = this;
            this.iframe = this.el.querySelector('iframe')
            if (this.iframe) {
                this.iframe.addEventListener('load', function () {
                    const iframeContent = self.iframe.contentDocument;
                    iframeContent.addEventListener('mousedown', function (e) {
                        self._selectElement(e.detail.element)
                    })
                    if (self._usesPositionReference?.()) {
                        self._watchReferenceFrame?.(self.iframe, iframeContent);
                    }
                });
            }

            this.__setRectInfo();

            this._documentMouseMove = function (e) {
                if (!self.clickedInfo?.isMoving) return;
                e.preventDefault();
                self._clearDocumentSelection();
                self._onMove(e);
            };
            this._documentMouseUp = function (e) {
                if (!self.clickedInfo?.isMoving) return;
                self._onUp(e);
                e.preventDefault();
            };
            this._documentTouchMove = function (e) {
                if (!self.clickedInfo?.isMoving || !e.touches.length) return;
                e.preventDefault();
                self._clearDocumentSelection();
                self._onMove(e.touches[0]);
            };
            this._documentTouchEnd = function (e) {
                if (!self.clickedInfo?.isMoving) return;
                self._onUp(e.changedTouches?.[0], e.type === "touchcancel");
            };
            this._documentBlur = function () {
                self._onUp(null, true);
            };
        }

        if (!this.options.delegated && !this.startEventsInitialized) {
            this.startEventsInitialized = true;
            const dragTargetEl = this.dragHandle || this.el;
            dragTargetEl.addEventListener('touchstart', (e) => this._handlePointerDown(e));
            dragTargetEl.addEventListener('mousedown', (e) => this._handlePointerDown(e));
        }

    },

    _handlePointerDown: function (event) {
        if (event.which > 1) return;
        if (!event.__positionDelegated) {
            if (this._shouldDelegateDrag?.()) return;
            this.options.dragType = "draggable";
            event.__positionHandled = true;
        }
        this._delayDragStart(event, !!event.__positionDelegated);
    },

    _delayDragStart: function (event, delegated = false) {
        this._cancelPendingDragStart();
        const doc = this.el.ownerDocument;
        this.pendingDragCancel = () => this._cancelPendingDragStart();
        doc.addEventListener("mouseup", this.pendingDragCancel, true);
        doc.addEventListener("touchend", this.pendingDragCancel, true);
        doc.addEventListener("touchcancel", this.pendingDragCancel, true);

        this.dragStartTimer = setTimeout(() => {
            this._cancelPendingDragStart();
            const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
            if (target?.hasAttribute("dnd-exclude") || hasSelection(this.el)) return;

            // Retain the original event until selection has been checked, then
            // initialize drag state from its source and pointer coordinates.
            this._onDown(event.touches?.[0] || event, delegated);
            if (!this.clickedInfo?.isMoving) return;
            this._selectElement();
            this._bindDocumentDrag();
        }, 200);
    },

    _cancelPendingDragStart: function () {
        if (this.dragStartTimer) {
            clearTimeout(this.dragStartTimer);
            this.dragStartTimer = null;
        }
        const doc = this.el.ownerDocument;
        if (this.pendingDragCancel) {
            doc.removeEventListener("mouseup", this.pendingDragCancel, true);
            doc.removeEventListener("touchend", this.pendingDragCancel, true);
            doc.removeEventListener("touchcancel", this.pendingDragCancel, true);
            this.pendingDragCancel = null;
        }
    },

    _bindDocumentDrag: function () {
        this._unbindDocumentDrag();
        document.addEventListener('mousemove', this._documentMouseMove);
        document.addEventListener('mouseup', this._documentMouseUp, true);
        document.addEventListener('touchmove', this._documentTouchMove, { passive: false });
        document.addEventListener('touchend', this._documentTouchEnd, true);
        document.addEventListener('touchcancel', this._documentTouchEnd, true);
        window.addEventListener('blur', this._documentBlur);
    },

    _unbindDocumentDrag: function () {
        document.removeEventListener('mousemove', this._documentMouseMove);
        document.removeEventListener('mouseup', this._documentMouseUp, true);
        document.removeEventListener('touchmove', this._documentTouchMove);
        document.removeEventListener('touchend', this._documentTouchEnd, true);
        document.removeEventListener('touchcancel', this._documentTouchEnd, true);
        window.removeEventListener('blur', this._documentBlur);
    },

    _onDown: function (e, delegated = false) {
        this.dragPreviewStarted = false;
        if (!this.options.draggable) {
            this.clickedInfo = null;
            return;
        }
        this.dragScope = delegated && this.options.dragScope?.contains(this.el)
            ? this.options.dragScope
            : null;
        this.dragType = this.options.dragType || "draggable";
        this._initSnappableDrag?.(delegated);
        this.originalStyle = {
            present: this.el.hasAttribute("style"),
            value: this.el.getAttribute("style")
        };
        // A title-bar style drag handle may contain controls. Those controls
        // must retain their native click, focus, and file-picker behavior.
        const interactive = e.target?.closest?.(INTERACTIVE_SELECTOR);
        if (this.dragHandle && interactive && this.dragHandle.contains(interactive)) {
            this.clickedInfo = null;
            return;
        }

        this.__getBoundStatus(e);

        this.clickedInfo = {
            x: this.point.x,
            y: this.point.y,
            cx: this.point.cx,
            cy: this.point.cy,
            w: this.rect.width,
            h: this.rect.height,
            isMoving: true,
            boundStatus: this.boundStatus,
            isChangeStart: true
        }
        this.dragOriginRect = this.el.getBoundingClientRect();
        this.dragStartClientX = e.clientX;
        this.dragStartClientY = e.clientY;
        this.dragOriginOffsetParent = this.el.offsetParent || this.el.parentElement;
        const computed = getComputedStyle(this.el);
        this.dragOriginPosition = computed.position;
        this.dragOriginLeft = parseFloat(computed.left) || 0;
        this.dragOriginTop = parseFloat(computed.top) || 0;
        this.dragOriginalVisibility = [
            this.el.style.getPropertyValue("visibility"),
            this.el.style.getPropertyPriority("visibility")
        ];
        this.dragOriginalOpacity = computed.opacity;
        const style = this.el.style;
        this.dragSizeVariables = {
            width: [style.getPropertyValue("--position-moving-width"), style.getPropertyPriority("--position-moving-width")],
            height: [style.getPropertyValue("--position-moving-height"), style.getPropertyPriority("--position-moving-height")]
        };
    },

    _onMove: function (e) {
        this._startMoving(e);
        this._updateSnappableReference?.(e.clientX, e.clientY, this.el.ownerDocument);
        this.__getBoundStatus(e)
        this.__animate();
    },

    _clearDocumentSelection: function () {
        this.el.ownerDocument.getSelection()?.removeAllRanges();
    },

    _startMoving: function () {
        if (!this.clickedInfo?.isMoving || this.dragPreviewStarted) return;
        this.dragPreviewStarted = true;
        this.el.classList.add("position-moving");
        if (this.dragType === "clonable")
            this.el.classList.add("position-cloning");
        this.movingPosition = this.dragOriginPosition;
        const rect = this.dragOriginRect;
        this.el.style.setProperty("--position-moving-width", rect.width + "px");
        this.el.style.setProperty("--position-moving-height", rect.height + "px");
        this._createDragGhost();
        if (this.dragType !== "clonable") {
            this.el.style.setProperty("visibility", "hidden");
        }
    },

    _createDragGhost: function () {
        const doc = this.el.ownerDocument;
        const ghost = this.el.cloneNode(true);
        const computed = getComputedStyle(this.el);
        for (let i = 0; i < computed.length; i++) {
            const property = computed[i];
            ghost.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
        }
        ghost.classList.add("position-moving");
        ghost.classList.add("position-moving-preview");
        ghost.classList.remove("position-cloning");
        if (this.dragType === "clonable")
            ghost.style.opacity = this.dragOriginalOpacity;
        ghost.setAttribute("aria-hidden", "true");
        const activationAttributes = ["draggable", "position-target", "draggable-query", "clonable-query", "droppable-query", "snappable-query", "draggable-value", "clonable-value", "position-reference"];
        const previewElements = [ghost, ...ghost.querySelectorAll("*")];
        for (const element of previewElements) {
            element.removeAttribute("id");
            for (const attribute of activationAttributes) element.removeAttribute(attribute);
        }
        ghost.style.position = "fixed";
        ghost.style.left = this.dragOriginRect.left + "px";
        ghost.style.top = this.dragOriginRect.top + "px";
        ghost.style.width = this.dragOriginRect.width + "px";
        ghost.style.height = this.dragOriginRect.height + "px";
        ghost.style.margin = "0";
        ghost.style.pointerEvents = "none";
        ghost.style.zIndex = "2147483647";
        (doc.body || doc.documentElement).appendChild(ghost);
        this.dragGhostEl = ghost;
    },

    _moveDragPreview: function () {
        if (!this.clickedInfo) return;
        const left = this.point.clientX - this.clickedInfo.x;
        const top = this.point.clientY - this.clickedInfo.y;
        if (this.dragGhostEl) {
            this.dragGhostEl.style.left = left + "px";
            this.dragGhostEl.style.top = top + "px";
        }
        if (this.dragType === "clonable") return;
        // The moving class makes the element fixed while dragging, so every
        // positioning mode must use viewport coordinates and preserve the
        // pointer's original offset within the element.
        this.el.style.left = left + "px";
        this.el.style.top = top + "px";
        this.el.style.right = "auto";
        this.el.style.bottom = "auto";
    },

    _persistFreeDragPosition: function () {
        if (!this.dragPreviewStarted || this.dragType === "clonable") return;
        const left = this.point.clientX - this.clickedInfo.x;
        const top = this.point.clientY - this.clickedInfo.y;
        const style = this.el.style;

        if (this.movingPosition === "fixed") {
            style.left = left + "px";
            style.top = top + "px";
        } else if (this.movingPosition === "absolute") {
            const offsetParent = this.dragOriginOffsetParent;
            const parentRect = offsetParent.getBoundingClientRect();
            style.left = left - parentRect.left - offsetParent.clientLeft + offsetParent.scrollLeft + "px";
            style.top = top - parentRect.top - offsetParent.clientTop + offsetParent.scrollTop + "px";
        } else if (this.movingPosition === "relative") {
            style.left = this.dragOriginLeft + this.point.clientX - this.dragStartClientX + "px";
            style.top = this.dragOriginTop + this.point.clientY - this.dragStartClientY + "px";
        } else {
            style.position = "fixed";
            style.left = left + "px";
            style.top = top + "px";
        }
        style.right = "auto";
        style.bottom = "auto";
    },

    _finishMoving: function () {
        this.el.classList.remove("position-moving");
        this.el.classList.remove("position-cloning");
        this.dragGhostEl?.remove();
        this.dragGhostEl = null;
        this.dragPreviewStarted = false;
        const [visibility, priority] = this.dragOriginalVisibility || [];
        if (visibility) this.el.style.setProperty("visibility", visibility, priority);
        else this.el.style.removeProperty("visibility");
        if (this.dragSizeVariables) {
            for (const [name, [value, priority]] of Object.entries({
                "--position-moving-width": this.dragSizeVariables.width,
                "--position-moving-height": this.dragSizeVariables.height
            })) {
                if (value) this.el.style.setProperty(name, value, priority);
                else this.el.style.removeProperty(name);
            }
        }
    },

    _onUp: function (e, cancelled = false) {
        this._unbindDocumentDrag();
        if (!this.clickedInfo) {
            this._finishMoving();
            this._clearSnappableState?.();
            return;
        }
        if (e) {
            this.__getBoundStatus(e);
        }
        this._finishSnappableReference?.(e);
        if (this.clickedInfo.isMoving && !this.dropQuerySelector &&
            !(this.snapQuerySelector && this.reference) && !this.isParked) {
            const snap_info = this._getViewportSnapArea();

            if (snap_info && !this.isSnap) {
                this._applyViewportSnap(snap_info);
                this.preSnapped = { x: this.rect.x, y: this.rect.y, width: this.rect.width, height: this.rect.height };
                this.isSnap = true;
            }

            let ghost_info = {
                x: this.point.clientX - this.clickedInfo.x,
                y: this.point.clientY - this.clickedInfo.y,
                w: this.dragOriginRect.width,
                h: this.dragOriginRect.height
            }

            this._snapGhostProcess(ghost_info)
        }

        if (this.clickedInfo.isMoving) {
            if (!cancelled && !this.dropQuerySelector &&
                !(this.snapQuerySelector && this.reference) && !this.isSnap)
                this._persistFreeDragPosition();
            this._finishMoving();
            this._completeSnappableDrop?.(cancelled);
        }

        this._clearSnappableState?.();

        if (this.clickedInfo.isMoving) {
            this.createEvent('element-moveend');
        }

        this.clickedInfo = null;
    },

    __setBound: function (el, x, y, w, h) {
        el.style.left = x;
        el.style.top = y;
        el.style.width = w;
        el.style.height = h;
    },

    __setRectInfo: function () {
        let bound = this.el.getBoundingClientRect();
        let parentRect = this.el.parentNode.getBoundingClientRect();
        this.rect = {};
        this.rect.x = bound.x - parentRect.x;
        this.rect.y = bound.y - parentRect.y;
        this.rect.width = bound.width;
        this.rect.height = bound.height;
        this.rect.top = bound.top - parentRect.top;
        this.rect.bottom = bound.bottom - parentRect.top;
        this.rect.left = bound.left - parentRect.left;
        this.rect.right = bound.right - parentRect.left;
    },

    __getBoundStatus: function (e) {
        let bound = this.el.getBoundingClientRect();
        let parentRect = this.el.parentNode.getBoundingClientRect();
        let x = e.clientX - bound.left;// - parentRect.left;
        let y = e.clientY - bound.top;// - parentRect.top;

        this.__setRectInfo();

        this.point.x = x;
        this.point.y = y;
        this.point.clientX = e.clientX;
        this.point.clientY = e.clientY;
        this.point.cx = e.clientX - parentRect.left;
        this.point.cy = e.clientY - parentRect.top;

        this.boundStatus = {
            isTop: y < this.MARGIN && y > -this.MARGIN,
            isLeft: x < this.MARGIN && x > -this.MARGIN,
            isRight: x >= bound.width - this.RIGHT_SCROL && x <= bound.width + this.MARGIN + (this.MARGIN - this.RIGHT_SCROL),
            isBottom: y >= bound.height - this.MARGIN && y <= bound.height + this.MARGIN
        }

        return this.boundStatus;
    },

    __between: function (x, min, max) {
        return x >= min && x <= max;
    },

    _getViewportSnapArea: function () {
        if (!this.clickedInfo || !this.dragOriginRect) return null;
        const doc = this.el.ownerDocument;
        const view = doc.defaultView;
        const width = doc.documentElement.clientWidth || view.innerWidth;
        const height = doc.documentElement.clientHeight || view.innerHeight;
        const left = this.point.clientX - this.clickedInfo.x;
        const top = this.point.clientY - this.clickedInfo.y;
        const right = width - left - this.dragOriginRect.width;
        const bottom = height - top - this.dragOriginRect.height;

        if (this.__between(top, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
            this.__between(left, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
            this.__between(right, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
            this.__between(bottom, this.NO_SNAP, this.FULLSCREEN_MARGIN))
            return { x: 0, y: 0, w: width, h: height };
        if (this.__between(top, this.NO_SNAP, this.SNAP_MARGIN))
            return { x: 0, y: 0, w: width, h: height / 2 };
        if (this.__between(left, this.NO_SNAP, this.SNAP_MARGIN))
            return { x: 0, y: 0, w: width / 2, h: height };
        if (this.__between(right, this.NO_SNAP, this.SNAP_MARGIN))
            return { x: width / 2, y: 0, w: width / 2, h: height };
        if (this.__between(bottom, this.NO_SNAP, this.SNAP_MARGIN))
            return { x: 0, y: height / 2, w: width, h: height / 2 };
        return null;
    },

    _applyViewportSnap: function ({ x, y, w, h }) {
        const style = this.el.style;
        style.position = "fixed";
        style.removeProperty("inset");
        style.left = x + "px";
        style.top = y + "px";
        style.right = "auto";
        style.bottom = "auto";
        style.width = w + "px";
        style.height = h + "px";
        style.boxSizing = "border-box";
    },

    __animate: function () {
        let c_info = this.clickedInfo;

        let eventName = null;

        if (c_info && c_info.isMoving) {
            /**
             * Ghost Process
             **/

            const snapArea = this._getViewportSnapArea();
            const ghost_info = snapArea
                ? { ...snapArea, type: "show" }
                : {
                    x: this.point.clientX - this.clickedInfo.x,
                    y: this.point.clientY - this.clickedInfo.y,
                    w: this.dragOriginRect.width,
                    h: this.dragOriginRect.height,
                    type: "hide"
                };

            if (ghost_info && !this.dropQuerySelector &&
                !(this.snapQuerySelector && this.reference) && !this.isParked && !this.isSnap) {
                this._snapGhostProcess(ghost_info)
            }

            if (this.isSnap) this.isSnap = false;
            this._moveDragPreview();

            eventName = "element-moving";
            if (c_info.isChangeStart) {
                this.clickedInfo.isChangeStart = false;
                eventName = "element-movestart";
            }

            this.createEvent(eventName)
            return;
        }
    },

    minMax() {
        if (!this.isSnap) {
            this.isSnap = true;
            this.preSnapped = { x: this.rect.x, y: this.rect.y, width: this.rect.width, height: this.rect.height };
            this.__setBound(this.el, 0, 0, "100%", "100%");
        } else {
            this.isSnap = false;
            this.el.style.left = this.preSnapped.x + 'px';
            this.el.style.top = this.preSnapped.y + 'px';
            this.el.style.width = this.preSnapped.width + 'px';
            this.el.style.height = this.preSnapped.height + 'px';
        }
    },


    /**
     * Position Events
     * move: element-moving, element-moveend, element-movestart
     **/
    createEvent(eventName, detail = {}) {
        return dispatch(this.el, eventName, { instance: this, reference: this.reference, ...detail });
    },

    _createSnapGhost: function (ghostClass) {
        const doc = this.el.ownerDocument;
        let node = doc.createElement("div");
        if (!ghostClass) {
            ghostClass = "snap-ghost";
        }

        node.classList.add(ghostClass);
        node.style.position = "fixed";
        node.style.pointerEvents = "none";
        (doc.body || doc.documentElement).appendChild(node);
        this.snapGhostEl = node;
    },

    _snapGhostProcess: function (info) {
        this.snapGhostEl.style.left = info.x + 'px';
        this.snapGhostEl.style.top = info.y + 'px';
        this.snapGhostEl.style.width = info.w + 'px';
        this.snapGhostEl.style.height = info.h + 'px';

        if (info.type === "show") {
            if (this.snapGhostEl.style.display === 'none') {
                this.snapGhostEl.style.display = 'block'
            }
            this.snapGhostEl.style.opacity = 0.2;
        } else {
            this.snapGhostEl.setAttribute("style", "display: none;");
        }
        return;
    },

    _selectElement: function (el) {
        this._releaseSelect();
        if (this.container) this.container['selectedPositionElement'] = this.el
        if (this.el) {
            this.createEvent('elementSelected');
            if (this.container) this.el.style.zIndex = this.container.positionIndex += 1;
            this.el.classList.add('selectedPosition');
        }
    },

    _releaseSelect: function () {
        let el = this.container?.['selectedPositionElement'];
        if (el)
            el.classList.remove("selectedPosition");
    },
}

export default position;
