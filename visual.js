/*
 Copyright 2023 Google LLC

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

// [START visualize_render_rgb]
/**
 * Renders an RGB GeoTiff image into an HTML canvas.
 *
 * The GeoTiff image must include 3 rasters (bands) which
 * correspond to [Red, Green, Blue] in that order.
 *
 * @param  {Object} rgb   GeoTiff with RGB values of the image.
 * @param  {Object} mask  Optional mask for transparency, defaults to opaque.
 * @return {HTMLCanvasElement}  Canvas element with the rendered image.
 */
export function renderRGB(rgb, mask) {
    const canvas = document.createElement('canvas');
  
    canvas.width = mask ? mask.width : rgb.width;
    canvas.height = mask ? mask.height : rgb.height;
  
    const dw = rgb.width / canvas.width;
    const dh = rgb.height / canvas.height;
  
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const rgbIdx = Math.floor(y * dh) * rgb.width + Math.floor(x * dw);
        const maskIdx = y * canvas.width + x;
  
        const imgIdx = y * canvas.width * 4 + x * 4;
        img.data[imgIdx + 0] = rgb.rasters[0][rgbIdx]; // Red
        img.data[imgIdx + 1] = rgb.rasters[1][rgbIdx]; // Green
        img.data[imgIdx + 2] = rgb.rasters[2][rgbIdx]; // Blue
        img.data[imgIdx + 3] = mask // Alpha
          ? mask.rasters[0][maskIdx] * 255
          : 255;
      }
    }
  
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
  // [END visualize_render_rgb]
  
  // [START visualize_render_palette]
  /**
   * Renders a single value GeoTiff image into an HTML canvas.
   *
   * The GeoTiff image must include 1 raster (band) which contains
   * the values we want to display.
   *
   * @param  {Object} options  Options for rendering.
   * @return {HTMLCanvasElement}  Canvas element with the rendered image.
   */
  export function renderPalette({
    data,
    mask,
    colors,
    min,
    max,
    index,
  }) {
    const palette = createPalette(colors ?? ['000000', 'ffffff']);
    const indices = data.rasters[index ?? 0]
      .map((x) => normalize(x, max ?? 1, min ?? 0))
      .map((x) => Math.round(x * (palette.length - 1)));
    return renderRGB(
      {
        ...data,
        rasters: [
          indices.map((i) => palette[i].r),
          indices.map((i) => palette[i].g),
          indices.map((i) => palette[i].b),
        ],
      },
      mask,
    );
  }
  
  /**
   * Creates an {r, g, b} color palette from a hex list of colors.
   *
   * @param  {string[]} hexColors  List of hex colors for the palette.
   * @return {Object[]}            RGB values for the color palette.
   */
  export function createPalette(hexColors) {
    const rgb = hexColors.map(colorToRGB);
    const size = 256;
    const step = (rgb.length - 1) / (size - 1);
    return Array(size)
      .fill(0)
      .map((_, i) => {
        const index = i * step;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        return {
          r: lerp(rgb[lower].r, rgb[upper].r, index - lower),
          g: lerp(rgb[lower].g, rgb[upper].g, index - lower),
          b: lerp(rgb[lower].b, rgb[upper].b, index - lower),
        };
      });
  }
  
  /**
   * Convert a hex color into an {r, g, b} color.
   *
   * @param  {string} color  Hex color like 0099FF or #0099FF.
   * @return {Object}        RGB values for that color.
   */
  export function colorToRGB(color) {
    const hex = color.startsWith('#') ? color.slice(1) : color;
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
    };
  }
  
  /**
   * Normalizes a number to a given data range.
   *
   * @param  {number} x    Value of interest.
   * @param  {number} max  Maximum value in data range, defaults to 1.
   * @param  {number} min  Minimum value in data range, defaults to 0.
   * @return {number}      Normalized value.
   */
  export function normalize(x, max = 1, min = 0) {
    const y = (x - min) / (max - min);
    return clamp(y, 0, 1);
  }
  
  /**
   * Calculates the linear interpolation for a value within a range.
   *
   * @param  {number} x  Lower value in the range, when `t` is 0.
   * @param  {number} y  Upper value in the range, when `t` is 1.
   * @param  {number} t  "Time" between 0 and 1.
   * @return {number}    Inbetween value for that "time".
   */
  export function lerp(x, y, t) {
    return x + t * (y - x);
  }
  
  /**
   * Clamps a value to always be within a range.
   *
   * @param  {number} x    Value to clamp.
   * @param  {number} min  Minimum value in the range.
   * @param  {number} max  Maximum value in the range.
   * @return {number}      Clamped value.
   */
  export function clamp(x, min, max) {
    return Math.min(Math.max(x, min), max);
  }
  // [END visualize_render_palette]
  
  export function rgbToColor({ r, g, b }) {
    const f = (x) => {
      const hex = Math.round(x).toString(16);
      return hex.length == 1 ? `0${hex}` : hex;
    };
    return `#${f(r)}${f(g)}${f(b)}`;
  }