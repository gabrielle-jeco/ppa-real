export type Point = { x: number; y: number };
export type CardGeometry = {
    left: number; right: number; top: number; bottom: number; centerX: number; centerY: number;
};
export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';
export type EdgeEnd = 'start' | 'end';
export type EdgeAnchor = { side: AnchorSide; position: number };
export type EdgeRoute = { points: Point[]; start_anchor?: EdgeAnchor; end_anchor?: EdgeAnchor };
type Attachment = { point: Point; anchor: EdgeAnchor };
export type RouteMotion = {
    route: EdgeRoute;
    size: { width: number; height: number };
    initialStart: Point;
    initialEnd: Point;
    start: Attachment;
    end: Attachment;
    startCard: CardGeometry;
    endCard: CardGeometry;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const horizontalSide = (side: AnchorSide) => side === 'top' || side === 'bottom';
const epsilon = 0.000001;

export function sideToward(card: CardGeometry, target: Point, preferred?: AnchorSide): AnchorSide {
    const dx = target.x - card.centerX;
    const dy = target.y - card.centerY;
    const x = Math.abs(dx) / Math.max(1, (card.right - card.left) / 2);
    const y = Math.abs(dy) / Math.max(1, (card.bottom - card.top) / 2);
    if (Math.abs(x - y) < epsilon && preferred) return preferred;
    return x > y ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
}

export function anchorPoint(card: CardGeometry, anchor: EdgeAnchor): Point {
    const position = clamp(anchor.position, 0, 1);
    return horizontalSide(anchor.side)
        ? { x: card.left + (card.right - card.left) * position, y: anchor.side === 'top' ? card.top : card.bottom }
        : { x: anchor.side === 'left' ? card.left : card.right, y: card.top + (card.bottom - card.top) * position };
}

export function defaultAnchor(card: CardGeometry, target: Point, offset = 0): EdgeAnchor {
    const side = sideToward(card, target);
    const length = horizontalSide(side) ? card.right - card.left : card.bottom - card.top;
    return { side, position: clamp(0.5 + offset / Math.max(1, length), 0, 1) };
}

function project(card: CardGeometry, side: AnchorSide, target: Point): Attachment {
    const position = horizontalSide(side)
        ? (target.x - card.left) / Math.max(1, card.right - card.left)
        : (target.y - card.top) / Math.max(1, card.bottom - card.top);
    const anchor = { side, position: clamp(position, 0, 1) };
    return { anchor, point: anchorPoint(card, anchor) };
}

function facesInward(card: CardGeometry, side: AnchorSide, target: Point): boolean {
    if (side === 'top') return target.y > card.top + epsilon;
    if (side === 'bottom') return target.y < card.bottom - epsilon;
    if (side === 'left') return target.x > card.left + epsilon;
    return target.x < card.right - epsilon;
}

export function createRouteMotion(route: EdgeRoute, startCard: CardGeometry, endCard: CardGeometry,
    startAnchor: EdgeAnchor, endAnchor: EdgeAnchor, size: { width: number; height: number }): RouteMotion {
    const start = { anchor: startAnchor, point: anchorPoint(startCard, startAnchor) };
    const end = { anchor: endAnchor, point: anchorPoint(endCard, endAnchor) };
    return { route, size, initialStart: start.point, initialEnd: end.point, start, end, startCard, endCard };
}

export function routeFromMotion(motion: RouteMotion, constrain = true): EdgeRoute {
    return {
        points: motion.route.points.map(point => ({
            x: constrain ? clamp(point.x, 0, 1) : point.x,
            y: constrain ? clamp(point.y, 0, 1) : point.y,
        })),
        start_anchor: motion.start.anchor,
        end_anchor: motion.end.anchor,
    };
}

function nearestAttachment(card: CardGeometry, pointer: Point, preferred: AnchorSide): Attachment {
    const sides: AnchorSide[] = [preferred, ...(['top', 'right', 'bottom', 'left'] as AnchorSide[]).filter(side => side !== preferred)];
    return sides.map(side => project(card, side, pointer)).reduce((best, candidate) =>
        Math.hypot(candidate.point.x - pointer.x, candidate.point.y - pointer.y) < Math.hypot(best.point.x - pointer.x, best.point.y - pointer.y) - epsilon ? candidate : best);
}

export function nearestAnchor(card: CardGeometry, target: Point): EdgeAnchor {
    return nearestAttachment(card, target, 'top').anchor;
}

export function moveCardConnection(motion: RouteMotion, end: EdgeEnd, card: CardGeometry, constrain = true): RouteMotion {
    const otherEnd = end === 'start' ? 'end' : 'start';
    const moving = motion[end];
    const endpoint = end === 'start' ? motion.route.points[0] : motion.route.points.at(-1);
    const target = endpoint ? { x: endpoint.x * motion.size.width, y: endpoint.y * motion.size.height } : motion[otherEnd].point;
    let next = project(card, moving.anchor.side, moving.point);
    // Tangential movement keeps the canvas attachment pinned; change sides only when the segment would cross the card.
    if (facesInward(card, next.anchor.side, target)) next = nearestAttachment(card, target, next.anchor.side);
    const otherCard = end === 'start' ? motion.endCard : motion.startCard;
    let other = motion[otherEnd];
    if (!endpoint) {
        const delta = { x: next.point.x - moving.point.x, y: next.point.y - moving.point.y };
        other = project(otherCard, other.anchor.side, { x: other.point.x + delta.x, y: other.point.y + delta.y });
        if (facesInward(otherCard, other.anchor.side, next.point)) other = nearestAttachment(otherCard, next.point, other.anchor.side);
    }
    void constrain;
    return { ...motion, [end]: next, [otherEnd]: other, ...(end === 'start' ? { startCard: card } : { endCard: card }) };
}

export function moveEndpoint(motion: RouteMotion, end: EdgeEnd, pointer: Point): EdgeRoute {
    const card = end === 'start' ? motion.startCard : motion.endCard;
    const attachment = nearestAttachment(card, pointer, motion[end].anchor.side);
    const route = routeFromMotion({ ...motion, [end]: attachment });
    const point = { x: clamp(pointer.x / motion.size.width, 0, 1), y: clamp(pointer.y / motion.size.height, 0, 1) };
    route.points = end === 'start' ? [point, ...route.points] : [...route.points, point];
    return route;
}

function attachmentToward(card: CardGeometry, previous: Attachment, target: Point): Attachment {
    return nearestAttachment(card, target, previous.anchor.side);
}

export function moveWaypoint(motion: RouteMotion, index: number, pointer: Point): EdgeRoute {
    const point = { x: clamp(pointer.x, 0, motion.size.width), y: clamp(pointer.y, 0, motion.size.height) };
    const start = index === 0 ? attachmentToward(motion.startCard, motion.start, point) : motion.start;
    const end = index === motion.route.points.length - 1 ? attachmentToward(motion.endCard, motion.end, point) : motion.end;
    const route = routeFromMotion({ ...motion, start, end });
    route.points[index] = {
        x: Number((point.x / motion.size.width).toFixed(5)),
        y: Number((point.y / motion.size.height).toFixed(5)),
    };
    return route;
}
