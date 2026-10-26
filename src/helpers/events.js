export function dispatch(element, name, detail = {}) {
	const EventConstructor = element?.ownerDocument?.defaultView?.CustomEvent;
	if (!EventConstructor) return;
	const event = new EventConstructor(name, {
		detail: { element, instance: element.position, ...detail }
	});
	element.dispatchEvent(event);
	return event;
}
