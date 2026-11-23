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
    weights: number[];
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
    const path = [start.point, ...route.points.map(point => ({ x: point.x * size.width, y: point.y * size.height })), end.point];
    const distances = [0];
    for (let index = 1; index < path.length; index++) {
        distances[index] = distances[index - 1] + Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
    }
    const length = distances[distances.length - 1];
    const weights = route.points.map((_, index) => 1 - (length > 0 ? distances[index + 1] / length : (index + 1) / (route.points.length + 1)));
    return { route, size, weights, initialStart: start.point, initialEnd: end.point, start, end, startCard, endCard };
}

export function routeFromMotion(motion: RouteMotion): EdgeRoute {
    const startDelta = { x: motion.start.point.x - motion.initialStart.x, y: motion.start.point.y - motion.initialStart.y };
    const endDelta = { x: motion.end.point.x - motion.initialEnd.x, y: motion.end.point.y - motion.initialEnd.y };
    const stationary = startDelta.x === 0 && startDelta.y === 0 && endDelta.x === 0 && endDelta.y === 0;
    return {
        points: motion.route.points.map((point, index) => {
            if (stationary) return { ...point };
            const weight = motion.weights[index];
            return {
                x: Number(clamp(point.x + (startDelta.x * weight + endDelta.x * (1 - weight)) / motion.size.width, 0, 1).toFixed(5)),
                y: Number(clamp(point.y + (startDelta.y * weight + endDelta.y * (1 - weight)) / motion.size.height, 0, 1).toFixed(5)),
            };
        }),
        start_anchor: motion.start.anchor,
        end_anchor: motion.end.anchor,
    };
}

export function moveCardConnection(motion: RouteMotion, end: EdgeEnd, card: CardGeometry): RouteMotion {
    const otherEnd = end === 'start' ? 'end' : 'start';
    const moving = motion[end];
    const other = motion[otherEnd];
    const otherCard = end === 'start' ? motion.endCard : motion.startCard;
    let next = project(card, moving.anchor.side, moving.point);
    const delta = { x: next.point.x - moving.point.x, y: next.point.y - moving.point.y };
    let nextOther = project(otherCard, other.anchor.side, { x: other.point.x + delta.x, y: other.point.y + delta.y });
    const tangent = horizontalSide(moving.anchor.side) ? 'x' : 'y';
    const pushed = Math.abs(delta[tangent]) > epsilon;
    const blocked = Math.abs(nextOther.point[tangent] - other.point[tangent] - delta[tangent]) > epsilon;
    const adjusted = routeFromMotion({ ...motion, [end]: next, [otherEnd]: nextOther });
    const pointAt = (edgeEnd: EdgeEnd, fallback: Point) => {
        const point = edgeEnd === 'start' ? adjusted.points[0] : adjusted.points[adjusted.points.length - 1];
        return point ? { x: point.x * motion.size.width, y: point.y * motion.size.height } : fallback;
    };
    const movingTarget = pointAt(end, nextOther.point);
    const otherTarget = pointAt(otherEnd, next.point);

    // Keep sliding on the current sides until their available space is exhausted.
    const nextSide = sideToward(card, movingTarget, moving.anchor.side);
    if (nextSide !== moving.anchor.side && ((pushed && blocked) || facesInward(card, moving.anchor.side, movingTarget))) {
        next = project(card, nextSide, next.point);
    }
    const otherSide = sideToward(otherCard, otherTarget, other.anchor.side);
    const otherTangent = horizontalSide(other.anchor.side) ? 'x' : 'y';
    const otherBlocked = Math.abs(delta[otherTangent]) > epsilon
        && Math.abs(nextOther.point[otherTangent] - other.point[otherTangent] - delta[otherTangent]) > epsilon;
    if (otherSide !== other.anchor.side && ((pushed && blocked) || otherBlocked || facesInward(otherCard, other.anchor.side, otherTarget))) {
        nextOther = project(otherCard, otherSide, nextOther.point);
    }
    return {
        ...motion,
        [end]: next,
        [otherEnd]: nextOther,
        ...(end === 'start' ? { startCard: card } : { endCard: card }),
    };
}

export function moveEndpoint(motion: RouteMotion, end: EdgeEnd, pointer: Point): EdgeRoute {
    const card = end === 'start' ? motion.startCard : motion.endCard;
    const side = motion.route.points.length === 0
        ? sideToward(card, pointer, motion[end].anchor.side)
        : motion[end].anchor.side;
    return routeFromMotion({ ...motion, [end]: project(card, side, pointer) });
}

function attachmentToward(card: CardGeometry, previous: Attachment, target: Point): Attachment {
    const side = sideToward(card, target, previous.anchor.side);
    if (side === previous.anchor.side) return previous;
    const dx = target.x - card.centerX;
    const dy = target.y - card.centerY;
    const scale = horizontalSide(side)
        ? ((side === 'top' ? card.top : card.bottom) - card.centerY) / dy
        : ((side === 'left' ? card.left : card.right) - card.centerX) / dx;
    return project(card, side, { x: card.centerX + dx * scale, y: card.centerY + dy * scale });
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
