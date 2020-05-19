'use strict';

const { Board } = require('./Board.js');
const { SpriteDrawer } = require('./Draw.js');
const { DIMENSIONS } = require('./Utils.js');
const { POSITIONS } = require('../images/sprite-positions.json');

class DrawingLayer {
    constructor(width, height, unit, className) {
            this.canvas = document.createElement('canvas');
            this.canvas.width = width;
            this.canvas.height = height;
            if (className) {
                this.canvas.className = className;
            }
            this.unit = unit;
            this.ctx = this.canvas.getContext('2d');
            this.objectsDrawn = [];
    }
    drawHere(spriteSheet, size, sX, sY, dX, dY, sWidth, sHeight, scale) {
        this.storeSprite(spriteSheet, size, sX, sY, dX, dY, sWidth, sHeight, scale);
        SpriteDrawer.drawSprite(
            this.ctx, spriteSheet,
            size * this.unit, sX * this.unit, sY * this.unit,
            dX, dY, sWidth, sHeight, scale
        );
    }
    /* eslint-disable-next-line no-unused-vars */
    storeSprite(spriteSheet, size, sX, sY, dX, dY, sWidth, sHeight, scale) {
        throw new Error('storeSprite(spriteSheet, size, sX, sY, dX, dY, sWidth, sHeight, scale) must be implemented by the subclass.');
    }
}

class PuyoDrawingLayer extends DrawingLayer {
    constructor(width, height, unit, className) {
        super(width, height, unit, className);
    }
    drawPuyo(spriteSheet, size, colour, directions = [], dX, dY) {
        let xPos, yPos;
        if(colour === 0) {
            xPos = POSITIONS.NUISANCE.X;
            yPos = POSITIONS.NUISANCE.Y;
        }
        else {
            xPos = POSITIONS.PUYO_START.X;
            yPos = POSITIONS.PUYO_START.Y + colour - 1;
            if(directions.includes('Down')) {
                xPos += 1;
            }
            if(directions.includes('Up')) {
                xPos += 2;
            }
            if(directions.includes('Right')) {
                xPos += 4;
            }
            if(directions.includes('Left')) {
                xPos += 8;
            }
        }
        this.drawHere(spriteSheet, size, xPos, yPos, dX, dY);
    }
    drawPoppingPuyo(spriteSheet, size, colour, drawPhaseTwo, dX, dY) {
        if(colour === 0) {
            if(!drawPhaseTwo) {
                const xPos = POSITIONS.NUISANCE.X;
                const yPos = POSITIONS.NUISANCE.Y;
                this.drawHere(spriteSheet, size, xPos, yPos, dX, dY);
            }
        }
        else {
            const xPos = (colour - 1) * 2 + (drawPhaseTwo ? 7 : 6);
            const yPos = 10;
            this.drawHere(spriteSheet, size, xPos, yPos, dX, dY);
        }
    }
    drawDrop(drop, size, dX, dY) {
        if("IhLHO".includes(drop.shape)) {
            this["draw_" + drop.shape](drop, size, dX, dY);
        }
    }
    draw_I(drop, size, dX, dY) {
        this.drawPuyo(drop.colours[0], size, [], dX, dY);

        dX += size * Math.cos(drop.standardAngle + Math.PI / 2);
        dY -= size * Math.sin(drop.standardAngle + Math.PI / 2);

        this.drawPuyo(drop.colours[1], size, [], dX, dY);
    }
    draw_h(drop, size, dX, dY) {
        this.drawPuyo(drop.colours[0], size, [], dX, dY);

        const dX2 = dX + size * Math.cos(drop.standardAngle + Math.PI / 2);
        const dY2 = dY - size * Math.sin(drop.standardAngle + Math.PI / 2);

        this.drawPuyo(drop.colours[0], size, [], dX2, dY2);

        const dX3 = dX + size * Math.cos(drop.standardAngle);
        const dY3 = dY - size * Math.sin(drop.standardAngle);

        this.drawPuyo(drop.colours[1], size, [], dX3, dY3);
    }
    draw_L(drop, size, dX, dY) {
        this.drawPuyo(drop.colours[0], size, [], dX, dY);

        const dX2 = dX + size * Math.cos(drop.standardAngle + Math.PI / 2);
        const dY2 = dY - size * Math.sin(drop.standardAngle + Math.PI / 2);

        this.drawPuyo(drop.colours[1], size, [], dX2, dY2);

        const dX3 = dX + size * Math.cos(drop.standardAngle);
        const dY3 = dY - size * Math.sin(drop.standardAngle);

        this.drawPuyo(drop.colours[0], size, [], dX3, dY3);
    }
    draw_H(drop, size, dX, dY) {
        const xChange = size / Math.sqrt(2) * Math.cos(- drop.standardAngle + Math.PI / 4);
        const yChange = size / Math.sqrt(2) * Math.sin(- drop.standardAngle + Math.PI / 4);

        this.drawPuyo(drop.colours[0], size, [], dX - xChange, dY - yChange);
        this.drawPuyo(drop.colours[0], size, [], dX -yChange, dY + xChange);
        this.drawPuyo(drop.colours[1], size, [], dX + xChange, dY + yChange);
        this.drawPuyo(drop.colours[1], size, [], dX + yChange, dY - xChange);
    }
    draw_O(drop, size, dX, dY) {
        const xChange = size / 2;
        const yChange = size / 2;

        this.drawPuyo(drop.colours[0], size, [], dX - xChange, dY - yChange);
        this.drawPuyo(drop.colours[0], size, [], dX - yChange, dY - xChange);
        this.drawPuyo(drop.colours[0], size, [], dX + xChange, dY + yChange);
        this.drawPuyo(drop.colours[0], size, [], dX + yChange, dY - xChange);
    }
}

/* eslint-disable-next-line */
class GameArea extends PuyoDrawingLayer {
    constructor(settings, appearance, scaleFactor) {
        let width = DIMENSIONS.BOARD.W * scaleFactor;
        let height = DIMENSIONS.BOARD.H * scaleFactor;
        width += DIMENSIONS.MARGIN + DIMENSIONS.QUEUE.W * scaleFactor;
        if (scaleFactor > DIMENSIONS.MIN_SCALE) {
            height += DIMENSIONS.MARGIN + DIMENSIONS.NUISANCE_QUEUE.H * scaleFactor;
        }
        super (width, height);
        this.settings = settings;
        this.appearance = appearance;
        this.boardLayer = new BoardLayer(settings, appearance, scaleFactor);
        this.nuisanceLayer = new NuisanceLayer(appearance, scaleFactor);
        this.simplified = true;
        if (scaleFactor > DIMENSIONS.MIN_SCALE) {
            this.simplified = false;
            this.queueLayer = new QueueLayer(appearance, scaleFactor);
        }
    }

}

class BoardLayer extends PuyoDrawingLayer {
    constructor(settings, appearance, scaleFactor) {
        super(scaleFactor * DIMENSIONS.BOARD.W, scaleFactor * DIMENSIONS.BOARD.H);
        this.settings = settings;
        this.appearance = appearance;
    }
}

class NuisanceLayer extends PuyoDrawingLayer {
    constructor(appearance, scaleFactor) {
        super(scaleFactor * DIMENSIONS.NUISANCE_QUEUE.W, scaleFactor * DIMENSIONS.NUISANCE_QUEUE.H);
        this.appearance = appearance;
        this.scaleFactor = scaleFactor;
    }
}

class QueueLayer extends PuyoDrawingLayer {
    constructor(appearance, scaleFactor) {
        super(scaleFactor * DIMENSIONS.QUEUE.W, scaleFactor * DIMENSIONS.QUEUE.H);
        this.appearance = appearance;
        this.scaleFactor = scaleFactor;
    }
}

/**
 * Class to manage updating for any canvas that draws Puyo (the main board or the queue).
 * The settings should not change over the span of the drawer being used
 * but the update function will need game state info.
 */
class DrawerWithPuyo {
    constructor() {
        this.objectsDrawn = [];
    }
    drawObject(xPos, yPos, size, dX, dY) {
        SpriteDrawer.drawSprite(this.ctx, this.appearance, size, xPos, yPos, dX, dY);
        this.objectsDrawn.push({xPos, yPos, size, dX, dY});
    }
    drawPuyo(colour, size, directions = [], dX, dY) {
        let xPos, yPos;
        if(colour === 0) {
            xPos = 6;
            yPos = 12;
        }
        else {
            xPos = 0;
            yPos = colour - 1;

            if(directions.includes('Down')) {
                xPos += 1;
            }
            if(directions.includes('Up')) {
                xPos += 2;
            }
            if(directions.includes('Right')) {
                xPos += 4;
            }
            if(directions.includes('Left')) {
                xPos += 8;
            }
        }
        this.drawObject(xPos, yPos, size, dX, dY);
    }
    drawPoppingPuyo(colour, size, drawPhaseTwo, dX, dY) {
        if(colour === 0) {
            if(!drawPhaseTwo) {
                this.drawObject(6, 12, size, dX, dY);
            }
            return;
        }
        const xPos = (colour - 1) * 2 + (drawPhaseTwo ? 7 : 6);
        const yPos = 10;

        this.drawObject(xPos, yPos, size, dX, dY);
    }
    drawDrop(drop, size, dX, dY) {
        if ("IhLHO".includes(drop.shape)) {
            this["draw_" + drop.shape](drop, size, dX, dY);
        }
    }
    draw_I(drop, size, dX, dY) {
        this.drawPuyo(drop.colours[0], size, [], dX, dY);

        dX += size * Math.cos(drop.standardAngle + Math.PI / 2);
        dY -= size * Math.sin(drop.standardAngle + Math.PI / 2);

        this.drawPuyo(drop.colours[1], size, [], dX, dY);
    }

    draw_h(drop, size, dX, dY) {
        this.drawPuyo(drop.colours[0], size, [], dX, dY);

        const dX2 = dX + size * Math.cos(drop.standardAngle + Math.PI / 2);
        const dY2 = dY - size * Math.sin(drop.standardAngle + Math.PI / 2);

        this.drawPuyo(drop.colours[0], size, [], dX2, dY2);

        const dX3 = dX + size * Math.cos(drop.standardAngle);
        const dY3 = dY - size * Math.sin(drop.standardAngle);

        this.drawPuyo(drop.colours[1], size, [], dX3, dY3);
    }

    draw_L(drop, size, dX, dY) {
        this.drawPuyo(drop.colours[0], size, [], dX, dY);

        const dX2 = dX + size * Math.cos(drop.standardAngle + Math.PI / 2);
        const dY2 = dY - size * Math.sin(drop.standardAngle + Math.PI / 2);

        this.drawPuyo(drop.colours[1], size, [], dX2, dY2);

        const dX3 = dX + size * Math.cos(drop.standardAngle);
        const dY3 = dY - size * Math.sin(drop.standardAngle);

        this.drawPuyo(drop.colours[0], size, [], dX3, dY3);
    }

    draw_H(drop, size, dX, dY) {
        const xChange = size / Math.sqrt(2) * Math.cos(- drop.standardAngle + Math.PI / 4);
        const yChange = size / Math.sqrt(2) * Math.sin(- drop.standardAngle + Math.PI / 4);

        this.drawPuyo(drop.colours[0], size, [], dX - xChange, dY - yChange);
        this.drawPuyo(drop.colours[0], size, [], dX -yChange, dY + xChange);
        this.drawPuyo(drop.colours[1], size, [], dX + xChange, dY + yChange);
        this.drawPuyo(drop.colours[1], size, [], dX + yChange, dY - xChange);
    }

    draw_O(drop, size, dX, dY) {
        const xChange = size / 2;
        const yChange = size / 2;

        this.drawPuyo(drop.colours[0], size, [], dX - xChange, dY - yChange);
        this.drawPuyo(drop.colours[0], size, [], dX - yChange, dY - xChange);
        this.drawPuyo(drop.colours[0], size, [], dX + xChange, dY + yChange);
        this.drawPuyo(drop.colours[0], size, [], dX + yChange, dY - xChange);
    }
}

/**
 * The drawer for the main area of the game.
 */
class BoardDrawer extends DrawerWithPuyo {
    constructor(settings, appearance, boardNum) {
        super();
        this.board = document.getElementById("board" + boardNum);
        this.ctx = this.board.getContext("2d");
        this.appearance = appearance;
        this.settings = settings;

        this.width = this.board.width;
        this.height = this.board.height;
        this.unitW = this.width / this.settings.cols;
        this.unitH = this.height / this.settings.rows;

        this.nuisanceCascadeFPR = [];
    }

    updateBoard(currentBoardState) {
        // Get current information about what to draw and get current width and height in case of resizing
        const {connections, currentDrop} = currentBoardState;
        const {rows} = this.settings;

        // Clear list of drawn objects
        this.objectsDrawn = [];

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // Save a canvas with the origin at the top left (every save coupled with a restore)
        ctx.save();

        // Move the canvas with the origin at the middle of the bottom left square
        ctx.translate(0.5 * this.unitW, (rows - 0.5) * this.unitH);

        // Use the connections array instead of board state
        connections.forEach(group => {
            group.forEach(puyo => {
                this.drawPuyo(puyo.colour, this.unitW, puyo.connections, this.unitW * puyo.col, - this.unitH * puyo.row);
            });
        });

        if (currentDrop.schezo.y != null) {
            this.drawPuyo(currentDrop.colours[0], this.unitW, [], this.unitW * currentDrop.arle.x, -this.unitH * currentDrop.arle.y);
            this.drawPuyo(currentDrop.colours[1], this.unitW, [], this.unitW * currentDrop.schezo.x, -this.unitH * currentDrop.schezo.y);
        } else {
            this.drawDrop(currentDrop, this.unitW, this.unitW * currentDrop.arle.x, - this.unitH * currentDrop.arle.y);
        }

        // Restore origin to top left
        ctx.restore();
        return JSON.stringify(this.objectsDrawn);
    }

    resolveChains(resolvingState) {
        // Get current information and assign it to convenient variables
        const {popFrames, dropFrames} = this.settings;
        const {connections, poppedLocs, connectionsAfterPop, unstablePuyos} = resolvingState;
        const {rows} = this.settings;

        // Clear list of drawn objects
        this.objectsDrawn = [];

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // Save a canvas with the origin at the top left (every save coupled with a restore)
        ctx.save();

        // Move the canvas with the origin at the middle of the bottom left square
        ctx.translate(0.5 * this.unitW, (rows - 0.5) * this.unitH);

        // Draw the stack in the pre-pop positions, with some puyo mid pop
        if (resolvingState.currentFrame <= this.settings.popFrames) {
            connections.forEach(group => {
                group.filter(puyo => !poppedLocs.some(puyo2 => puyo.col === puyo2.col && puyo.row === puyo2.row)).forEach(puyo => {
                    this.drawPuyo(puyo.colour, this.unitW, puyo.connections, this.unitW * puyo.col, - this.unitH * puyo.row);
                });
            });

            poppedLocs.forEach(puyo => {
                this.drawPoppingPuyo(
                    puyo.colour,
                    this.unitW,
                    resolvingState.currentFrame >= this.settings.popFrames / 3,
                    this.unitW * puyo.col,
                    -this.unitH * puyo.row
                );
            });
        }
        // Draw the stack dropping with the popped puyos gone
        else {
            // Unaffected puyos
            connectionsAfterPop.forEach(group => {
                group.forEach(puyo => {
                    this.drawPuyo(puyo.colour, this.unitW, puyo.connections, this.unitW * puyo.col, - this.unitH * puyo.row);
                });
            });
            // Unstable Puyos
            unstablePuyos.filter(puyo => !poppedLocs.some(puyo2 => puyo.col === puyo2.col && puyo.row === puyo2.row)).forEach(puyo => {
                this.drawPuyo(
                    puyo.colour,
                    this.unitW,
                    [],             // Force drawing of isolated puyo
                    this.unitW * puyo.col,
                    -this.unitH * Math.max(puyo.row - (puyo.row - puyo.above) * (resolvingState.currentFrame - popFrames) / dropFrames, puyo.above)
                );
            });
        }
        ctx.restore();
        return JSON.stringify(this.objectsDrawn);
    }

    initNuisanceDrop(nuisanceCascadeFPR) {
        this.nuisanceCascadeFPR = nuisanceCascadeFPR;
    }

    dropNuisance(boardState, nuisanceState) {
        const {nuisanceArray, currentFrame} = nuisanceState;
        const {cols, rows} = this.settings;

        // Clear list of drawn objects
        this.objectsDrawn = [];

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // Save a canvas with the origin at the top left (every save coupled with a restore)
        ctx.save();

        // Move the canvas with the origin at the middle of the bottom left square
        ctx.translate(0.5 * this.unitW, (rows - 0.5) * this.unitH);

        const connections = new Board(this.settings, boardState).getConnections();
        connections.forEach(group => {
            group.forEach(puyo => {
                this.drawPuyo(puyo.colour, this.unitW, puyo.connections, this.unitW * puyo.col, - this.unitH * puyo.row);
            });
        });

        for (let i = 0; i < cols; i++) {
            const startingRowsAbove = this.settings.nuisanceSpawnRow - boardState[i].length;
            const rowsDropped = Math.min(currentFrame / this.nuisanceCascadeFPR[i], startingRowsAbove);
            for (let j = 0; j < nuisanceArray[i].length; j++) {
                this.drawPuyo(0, this.unitW, [], this.unitW * i, -this.unitH * (this.settings.nuisanceSpawnRow - rowsDropped + j));
            }
        }

        // Restore origin to top left
        ctx.restore();
        return JSON.stringify(this.objectsDrawn);
    }

    drawFromHash(hash) {
        const objects = JSON.parse(hash);
        const {rows} = this.settings;

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // Save a canvas with the origin at the top left (every save coupled with a restore)
        ctx.save();

        // Move the canvas with the origin at the middle of the bottom left square
        ctx.translate(0.5 * this.unitW, (rows - 0.5) * this.unitH);

        objects.forEach(object => {
            const { xPos, yPos, size, dX, dY } = object;
            this.drawObject(xPos, yPos, size, dX, dY);
        });

        ctx.restore();
    }
}

module.exports = { BoardDrawer };
