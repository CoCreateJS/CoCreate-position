export function normalizeEvent(event) {
	const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
	const originalEvent = detail.originalEvent || event;
	const target = detail.target ?? originalEvent?.target ?? event?.target ?? null;
	const cursor = detail.cursor || {};
	return {
		type: originalEvent?.type || event?.type || "",
		target,
		relatedTarget: detail.relatedTarget ?? originalEvent?.relatedTarget ?? event?.relatedTarget ?? null,
		document: detail.document ?? originalEvent?.view?.document ?? target?.ownerDocument ?? null,
		clientX: cursor.x ?? originalEvent?.clientX ?? event?.clientX,
		clientY: cursor.y ?? originalEvent?.clientY ?? event?.clientY,
		which: originalEvent?.which ?? event?.which,
		button: originalEvent?.button ?? event?.button,
		touches: originalEvent?.touches ?? event?.touches,
		changedTouches: originalEvent?.changedTouches ?? event?.changedTouches,
		originalEvent,
		detail: event?.detail,
		preventDefault() {
			originalEvent?.preventDefault?.();
			if (event !== originalEvent) event?.preventDefault?.();
		}
	};
}

export function dispatch(element, name, detail = {}) {
	const EventConstructor = element?.ownerDocument?.defaultView?.CustomEvent;
	if (!EventConstructor) return;
	const event = new EventConstructor(name, {
		detail: { element, instance: element.position, ...detail }
	});
	element.dispatchEvent(event);
	return event;
}
