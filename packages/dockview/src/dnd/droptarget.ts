import { toggleClass } from '../dom';
import { Emitter, Event } from '../events';
import { CompositeDisposable } from '../lifecycle';
import { DragAndDropObserver } from './dnd';
import { clamp } from '../math';
import { Direction } from '../gridview/baseComponentGridview';

export enum Position {
    Top = 'Top',
    Left = 'Left',
    Bottom = 'Bottom',
    Right = 'Right',
    Center = 'Center',
}

export function directionToPosition(direction: Direction): Position {
    switch (direction) {
        case 'above':
            return Position.Top;
        case 'below':
            return Position.Bottom;
        case 'left':
            return Position.Left;
        case 'right':
            return Position.Right;
        case 'within':
            return Position.Center;
        default:
            throw new Error(`invalid direction ${direction}`);
    }
}

export type Quadrant = 'top' | 'bottom' | 'left' | 'right';

export interface DroptargetEvent {
    position: Position;
    nativeEvent: DragEvent;
}

export type DropTargetDirections =
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'center';

function isBooleanValue(
    canDisplayOverlay: CanDisplayOverlay
): canDisplayOverlay is boolean {
    return typeof canDisplayOverlay === 'boolean';
}

export type CanDisplayOverlay =
    | boolean
    | ((dragEvent: DragEvent, state: Quadrant | null) => boolean);

export class Droptarget extends CompositeDisposable {
    private target: HTMLElement | undefined;
    private overlay: HTMLElement | undefined;
    private _state: Position | undefined;

    private readonly _onDrop = new Emitter<DroptargetEvent>();
    readonly onDrop: Event<DroptargetEvent> = this._onDrop.event;

    get state() {
        return this._state;
    }

    constructor(
        private readonly element: HTMLElement,
        private readonly options: {
            canDisplayOverlay: CanDisplayOverlay;
            acceptedTargetZones: DropTargetDirections[];
            overlayModel?: {
                size?: { value: number; type: 'pixels' | 'percentage' };
                activationSize?: {
                    value: number;
                    type: 'pixels' | 'percentage';
                };
            };
        }
    ) {
        super();

        // use a set to take advantage of #<set>.has
        const acceptedTargetZonesSet = new Set(
            this.options.acceptedTargetZones
        );

        this.addDisposables(
            this._onDrop,
            new DragAndDropObserver(this.element, {
                onDragEnter: () => undefined,
                onDragOver: (e) => {
                    const width = this.element.clientWidth;
                    const height = this.element.clientHeight;

                    if (width === 0 || height === 0) {
                        return; // avoid div!0
                    }

                    const rect = (
                        e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;

                    const quadrant = this.calculateQuadrant(
                        acceptedTargetZonesSet,
                        x,
                        y,
                        width,
                        height
                    );

                    if (quadrant === undefined) {
                        this.removeDropTarget();
                        return;
                    }

                    if (isBooleanValue(this.options.canDisplayOverlay)) {
                        if (!this.options.canDisplayOverlay) {
                            return;
                        }
                    } else if (!this.options.canDisplayOverlay(e, quadrant)) {
                        return;
                    }

                    if (!this.target) {
                        this.target = document.createElement('div');
                        this.target.className = 'drop-target-dropzone';
                        this.overlay = document.createElement('div');
                        this.overlay.className = 'drop-target-selection';
                        this._state = Position.Center;
                        this.target.appendChild(this.overlay);

                        this.element.classList.add('drop-target');
                        this.element.append(this.target);
                    }

                    if (this.options.acceptedTargetZones.length === 0) {
                        return;
                    }

                    if (!this.target || !this.overlay) {
                        return;
                    }

                    this.toggleClasses(quadrant, width, height);

                    this.setState(quadrant);
                },
                onDragLeave: () => {
                    this.removeDropTarget();
                },
                onDragEnd: () => {
                    this.removeDropTarget();
                },
                onDrop: (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const state = this._state;

                    this.removeDropTarget();

                    if (state) {
                        this._onDrop.fire({ position: state, nativeEvent: e });
                    }
                },
            })
        );
    }

    public dispose() {
        this.removeDropTarget();
    }

    private toggleClasses(
        quadrant: Quadrant | null,
        width: number,
        height: number
    ) {
        if (!this.overlay) {
            return;
        }

        const isSmallX = width < 100;
        const isSmallY = height < 100;

        const isLeft = quadrant === 'left';
        const isRight = quadrant === 'right';
        const isTop = quadrant === 'top';
        const isBottom = quadrant === 'bottom';

        const rightClass = !isSmallX && isRight;
        const leftClass = !isSmallX && isLeft;
        const topClass = !isSmallY && isTop;
        const bottomClass = !isSmallY && isBottom;

        let size = 0.5;

        if (this.options.overlayModel?.size?.type === 'percentage') {
            size = clamp(this.options.overlayModel.size.value, 0, 100) / 100;
        }

        if (this.options.overlayModel?.size?.type === 'pixels') {
            if (rightClass || leftClass) {
                size =
                    clamp(0, this.options.overlayModel.size.value, width) /
                    width;
            }
            if (topClass || bottomClass) {
                size =
                    clamp(0, this.options.overlayModel.size.value, height) /
                    height;
            }
        }

        const translate = (1 - size) / 2;
        const scale = size;

        let transform: string;

        if (rightClass) {
            transform = `translateX(${100 * translate}%) scaleX(${scale})`;
        } else if (leftClass) {
            transform = `translateX(-${100 * translate}%) scaleX(${scale})`;
        } else if (topClass) {
            transform = `translateY(-${100 * translate}%) scaleY(${scale})`;
        } else if (bottomClass) {
            transform = `translateY(${100 * translate}%) scaleY(${scale})`;
        } else {
            transform = '';
        }

        this.overlay.style.transform = transform;

        toggleClass(this.overlay, 'small-right', isSmallX && isRight);
        toggleClass(this.overlay, 'small-left', isSmallX && isLeft);
        toggleClass(this.overlay, 'small-top', isSmallY && isTop);
        toggleClass(this.overlay, 'small-bottom', isSmallY && isBottom);
    }

    private setState(quadrant: Quadrant | null) {
        switch (quadrant) {
            case 'top':
                this._state = Position.Top;
                break;
            case 'left':
                this._state = Position.Left;
                break;
            case 'bottom':
                this._state = Position.Bottom;
                break;
            case 'right':
                this._state = Position.Right;
                break;
            default:
                this._state = Position.Center;
                break;
        }
    }

    private calculateQuadrant(
        overlayType: Set<DropTargetDirections>,
        x: number,
        y: number,
        width: number,
        height: number
    ): Quadrant | null | undefined {
        const isPercentage =
            this.options.overlayModel?.activationSize === undefined ||
            this.options.overlayModel?.activationSize?.type === 'percentage';

        const value =
            typeof this.options.overlayModel?.activationSize?.value === 'number'
                ? this.options.overlayModel?.activationSize?.value
                : 20;

        if (isPercentage) {
            return calculateQuadrant_Percentage(
                overlayType,
                x,
                y,
                width,
                height,
                value
            );
        }

        return calculateQuadrant_Pixels(
            overlayType,
            x,
            y,
            width,
            height,
            value
        );
    }

    private removeDropTarget() {
        if (this.target) {
            this._state = undefined;
            this.element.removeChild(this.target);
            this.target = undefined;
            this.overlay = undefined;
            this.element.classList.remove('drop-target');
        }
    }
}

function calculateQuadrant_Percentage(
    overlayType: Set<DropTargetDirections>,
    x: number,
    y: number,
    width: number,
    height: number,
    threshold: number
): Quadrant | null | undefined {
    const xp = (100 * x) / width;
    const yp = (100 * y) / height;

    if (overlayType.has('left') && xp < threshold) {
        return 'left';
    }
    if (overlayType.has('right') && xp > 100 - threshold) {
        return 'right';
    }
    if (overlayType.has('top') && yp < threshold) {
        return 'top';
    }
    if (overlayType.has('bottom') && yp > 100 - threshold) {
        return 'bottom';
    }

    if (!overlayType.has('center')) {
        return undefined;
    }

    return null;
}

function calculateQuadrant_Pixels(
    overlayType: Set<DropTargetDirections>,
    x: number,
    y: number,
    width: number,
    height: number,
    threshold: number
): Quadrant | null | undefined {
    if (overlayType.has('left') && x < threshold) {
        return 'left';
    }
    if (overlayType.has('right') && x > width - threshold) {
        return 'right';
    }
    if (overlayType.has('top') && y < threshold) {
        return 'top';
    }
    if (overlayType.has('right') && y > height - threshold) {
        return 'bottom';
    }

    if (!overlayType.has('center')) {
        return undefined;
    }

    return null;
}
