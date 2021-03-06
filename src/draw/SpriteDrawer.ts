'use strict';

const SHEET_ROWS = 16;  // number of rows in the sprite grid
const SHEET_COLS = 16;  // number of columns in the sprite grid
const SHEET_UNIT = 32;  // number of pixels in a sprite grid unit
const SHEET_GAP = 1;    // number of pixels before sprite starts (top/left)
const SHEET_USED_UNIT = SHEET_UNIT - SHEET_GAP;
const SUB_SCALE_FACTOR = 1.05;

const SpriteCache: Record<string, Sprite> = {};

/**
 * Stores and loads scaled sprites.
 * Use loadImage to pre-emptively load an unscaled image for use
 * Use loadSprite to pre-emptively load an appropriately unit scaled version of an image (as an offscreen canvas)
 * Use drawSprite to draw a specific sprite at a specific size onto a desired canvas
 *
 */

export function drawSprite(args: DrawingArgs): void {
	const { ctx, appearance: spriteSheet, size, sX, sY, dX = 0, dY = 0, sWidth = 1, sHeight = 1, merge = true} = args;

	const sourceSize = merge ? size * SUB_SCALE_FACTOR : size;
	if (loadSprite(spriteSheet, sourceSize)) {
		const spriteWidth = sWidth * sourceSize + (sWidth - 1) * sourceSize / SHEET_USED_UNIT;
		const spriteHeight = sHeight * sourceSize + (sHeight - 1) * sourceSize / SHEET_USED_UNIT;
		ctx.drawImage(
			SpriteCache[spriteSheet].sizes.get(sourceSize),
			(sX * SHEET_UNIT / SHEET_USED_UNIT + 1 / SHEET_USED_UNIT) * sourceSize,
			(sY * SHEET_UNIT / SHEET_USED_UNIT + 1 / SHEET_USED_UNIT) * sourceSize,
			spriteWidth, spriteHeight,
			dX - sWidth * sourceSize / 2, dY - sHeight * sourceSize / 2,
			spriteWidth, spriteHeight
		);
	}
}

/**
 * Loads canvas with scaled sprite sheet if it hasn't been done yet.
 * Will return false if the original image hasn't been loaded and cannot be accessed to scale into a canvas.
 * @param  {string} 	spriteSheet [description]
 * @param  {number} 	size        [description]
 * @return {boolean}	            Whether the sprite was able to be drawn.
 */
function loadSprite(spriteSheet: string, size: number) {
	if(!loadImage(spriteSheet)) {
		return false;
	}

	// SpriteDrawer[spriteSheet].sizes.get(size) is an html canvas object
	// e.g. SpriteDrawer['Aqua'].sizes.get(50) is a canvas that has Aqua.png drawn with unit size 50
	if(!SpriteCache[spriteSheet].sizes.has(size)) {
		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(SHEET_COLS * SHEET_UNIT * size / SHEET_USED_UNIT);
		canvas.height = Math.ceil(SHEET_ROWS * SHEET_UNIT * size / SHEET_USED_UNIT);

		canvas.getContext('2d').drawImage(
			SpriteCache[spriteSheet].image,
			0, 0,
			canvas.width, canvas.height
		);
		SpriteCache[spriteSheet].sizes.set(size, canvas);
	}
	return true;
}

/**
 * Loads sprite sheet image if it hasn't been done yet.
 * @param 	{string} 	 	spriteSheet The name of the spritesheet to be loaded
 * @return 	{boolean}					Whether the image has been loaded yet
 */
function loadImage(spriteSheet: string): boolean {
	if(SpriteCache[spriteSheet]) {
		return SpriteCache[spriteSheet].loaded;
	}

	const sprite = { sizes: new Map<number, HTMLCanvasElement>(), loaded: false } as Sprite;

	const image = new Image();
	image.src = `./images/${spriteSheet}.png`;
	image.addEventListener('load', function() {
		sprite.loaded = true;
	});
	sprite.image = image;

	SpriteCache[spriteSheet] = sprite;
	return sprite.loaded;
}
