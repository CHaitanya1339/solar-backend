import fetch from 'node-fetch';
import * as geotiff from 'geotiff';
import geokeysToProj4 from 'geotiff-geokeys-to-proj4';
import proj4 from 'proj4';
import express from 'express';
import Tiff from 'tiff.js';
const app = express();
const port = 3000;
import fs from 'fs';
import { get } from 'http';
import { getDistance } from 'geolib'; 

// Google Cloud API key (replace with your actual API key)
const apiKey = 'AIzaSyBgBzxUb1STGGRI4gMGooODJYRVG_yUK9o';
var dataLayersResponse;
var buildingInsights;
/**
 * Downloads the pixel values for a Data Layer URL from the Solar API.
 *
 * @param  {string} url        URL from the Data Layers response.
 * @param  {string} apiKey     Google Cloud API key.
 * @return {Promise<Object>}   Pixel values with shape and lat/lon bounds.
 */
async function downloadGeoTIFF(url, apiKey) {
  console.log(`Downloading data layer: ${url}`);

  // Include your Google Cloud API key in the Data Layers URL.
  const solarUrl = url.includes('solar.googleapis.com') ? url + `&key=${apiKey}` : url;
  console.log("Now fetching this URL: ", solarUrl);
  
  const response = await fetch(solarUrl);
  
  if (response.status !== 200) {
    const error = await response.json();
    console.error(`downloadGeoTIFF failed: ${url}\n`, error);
    throw error;
  }

  // Get the GeoTIFF rasters, which are the pixel values for each band.
  console.log("I need this", response);
  const arrayBuffer = await response.arrayBuffer();
  const tiff = await geotiff.fromArrayBuffer(arrayBuffer);
  console.log("TIFF", tiff);
  const image = await tiff.getImage();
  console.log("Image", image);
  const rasters = await image.readRasters();

  // Reproject the bounding box into lat/lon coordinates.
  const geoKeys = image.getGeoKeys();
  const projObj = geokeysToProj4.toProj4(geoKeys);
  const projection = proj4(projObj.proj4, 'WGS84');
  const box = image.getBoundingBox();
  
  const sw = projection.forward({
    x: box[0] * projObj.coordinatesConversionParameters.x,
    y: box[1] * projObj.coordinatesConversionParameters.y,
  });
  const ne = projection.forward({
    x: box[2] * projObj.coordinatesConversionParameters.x,
    y: box[3] * projObj.coordinatesConversionParameters.y,
  });

  return {
    // Width and height of the data layer image in pixels.
    // Used to know the row and column since JavaScript
    // stores the values as flat arrays.
    width: rasters.width,
    height: rasters.height,
    // Each raster represents the pixel values of each band.
    // Convert them from `geotiff.TypedArray`s into plain
    // JavaScript arrays to make them easier to process.
    rasters: [...Array(rasters.length).keys()].map((i) =>
      Array.from(rasters[i])
    ),
    // The bounding box as a lat/lon rectangle.
    bounds: {
      north: ne.y,
      south: sw.y,
      east: ne.x,
      west: sw.x,
    },
  };
}

export async function getLayer(layerId, urls, apiKey) {
  const get = {
    mask: async function() {
      const mask = await downloadGeoTIFF(urls.maskUrl, apiKey);
      console.log("Mask data", mask);
      const colors = binaryPalette;
      return {
        id: layerId,
        bounds: mask.bounds,
        palette: {
          colors: colors,
          min: 'No roof',
          max: 'Roof',
        },
        render: (showRoofOnly) => [
          renderPalette({
            data: mask,
            mask: showRoofOnly ? mask : undefined,
            colors: colors,
          }),
        ],
      };
    },
    dsm: async function() {
      const [mask, data] = await Promise.all([
        downloadGeoTIFF(urls.maskUrl, apiKey),
        downloadGeoTIFF(urls.dsmUrl, apiKey),
      ]);
      const sortedValues = Array.from(data.rasters[0]).sort((x, y) => x - y);
      const minValue = sortedValues[0];
      const maxValue = sortedValues.slice(-1)[0];
      const colors = rainbowPalette;
      return {
        id: layerId,
        bounds: mask.bounds,
        palette: {
          colors: colors,
          min: `${minValue.toFixed(1)} m`,
          max: `${maxValue.toFixed(1)} m`,
        },
        render: (showRoofOnly) => [
          renderPalette({
            data: data,
            mask: showRoofOnly ? mask : undefined,
            colors: colors,
            min: sortedValues[0],
            max: sortedValues.slice(-1)[0],
          }),
        ],
      };
    },
    rgb: async function() {
      const [mask, data] = await Promise.all([
        downloadGeoTIFF(urls.maskUrl, apiKey),
        downloadGeoTIFF(urls.rgbUrl, apiKey),
      ]);
      return {
        id: layerId,
        bounds: mask.bounds,
        render: (showRoofOnly) => [renderRGB(data, showRoofOnly ? mask : undefined)],
      };
    },
    annualFlux: async function() {
      const [mask, data] = await Promise.all([
        downloadGeoTIFF(urls.maskUrl, apiKey),
        downloadGeoTIFF(urls.annualFluxUrl, apiKey),
      ]);
      const colors = ironPalette;
      return {
        id: layerId,
        bounds: mask.bounds,
        palette: {
          colors: colors,
          min: 'Shady',
          max: 'Sunny',
        },
        render: (showRoofOnly) => [
          renderPalette({
            data: data,
            mask: showRoofOnly ? mask : undefined,
            colors: colors,
            min: 0,
            max: 1800,
          }),
        ],
      };
    },
    monthlyFlux: async function() {
      const [mask, data] = await Promise.all([
        downloadGeoTIFF(urls.maskUrl, apiKey),
        downloadGeoTIFF(urls.monthlyFluxUrl, apiKey),
      ]);
      const colors = ironPalette;
      return {
        id: layerId,
        bounds: mask.bounds,
        palette: {
          colors: colors,
          min: 'Shady',
          max: 'Sunny',
        },
        render: (showRoofOnly) =>
          [...Array(12).keys()].map((month) =>
            renderPalette({
              data: data,
              mask: showRoofOnly ? mask : undefined,
              colors: colors,
              min: 0,
              max: 200,
              index: month,
            }),
          ),
      };
    },
    hourlyShade: async function() {
      const [mask, ...months] = await Promise.all([
        downloadGeoTIFF(urls.maskUrl, apiKey),
        ...urls.hourlyShadeUrls.map((url) => downloadGeoTIFF(url, apiKey)),
      ]);
      const colors = sunlightPalette;
      return {
        id: layerId,
        bounds: mask.bounds,
        palette: {
          colors: colors,
          min: 'Shade',
          max: 'Sun',
        },
        render: (showRoofOnly, month, day) =>
          [...Array(24).keys()].map((hour) =>
            renderPalette({
              data: {
                ...months[month],
                rasters: months[month].rasters.map((values) =>
                  values.map((x) => x & (1 << (day - 1))),
                ),
              },
              mask: showRoofOnly ? mask : undefined,
              colors: colors,
              min: 0,
              max: 1,
              index: hour,
            }),
          ),
      };
    },
  };

  console.log(`Attempting to get layer: ${layerId}`);
  console.log('Available layer types:', Object.keys(get));

  if (!layerId) {
    throw new Error('layerId is undefined or empty');
  }

  if (!(layerId in get)) {
    throw new Error(`Invalid layerId: ${layerId}. Available types are: ${Object.keys(get).join(', ')}`);
  }

  try {
    return await get[layerId]();
  } catch (e) {
    console.error(`Error getting layer: ${layerId}\n`, e);
    throw e;
  }
}

async function getGeocodingData(lat, long, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${long}&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

// Import geolib for distance calculations

async function showDataLayer(reset = false, initialLayerId = 'rgb') {
  let layer = undefined;
  let requestError = undefined;
  let layerId = initialLayerId; // Set an initial value for layerId
  let showRoofOnly = false;
  let overlays = [];
  let month = 2;
  let day = 2;
  if (reset) {
    dataLayersResponse = undefined;
    requestError = undefined;
    layer = undefined;

    // Default values per layer
    showRoofOnly = ['annualFlux', 'monthlyFlux', 'hourlyShade'].includes(layerId);
    month = layerId === 'hourlyShade' ? 3 : 0;
    day = 14;
    hour = 5;
    playAnimation = ['monthlyFlux', 'hourlyShade'].includes(layerId);
  }

  if (!buildingInsights) {
    console.error("Error: buildingInsights is undefined.");
    return;
  }

  const center = buildingInsights.center;
  const ne = buildingInsights.boundingBox.ne;
  const sw = buildingInsights.boundingBox.sw;

  // Calculate diameter using geolib
  const diameter = getDistance(
    { latitude: ne.latitude, longitude: ne.longitude },
    { latitude: sw.latitude, longitude: sw.longitude }
  );
  const radius = Math.ceil(diameter / 2);

  try {
    dataLayersResponse = dataLayersResponse || (await getDataLayers(center, apiKey));
  } catch (e) {
    requestError = e;
    console.error("Error fetching data layers:", e);
    return;
  }

  if (!dataLayersResponse) {
    console.error("Error: dataLayersResponse is undefined.");
    return;
  }

  try {
    console.log('Fetching layer with layerId:', layerId);
    layer = await getLayer(layerId, dataLayersResponse, apiKey);
    console.log("Layer", layer);
    if (!layer) {
      throw new Error('Layer could not be initialized.');
    }
  } catch (e) {
    requestError = e;
    console.error("Error in fetching layer:", e);
    return;
  }

  const bounds = layer.bounds;
  console.log('Render layer:', {
    layerId: layer.id,
    showRoofOnly: showRoofOnly,
    month: 2,
    day: 10,
  });

  overlays.forEach((overlay) => overlay.setMap(null));
  overlays = layer
    .render(showRoofOnly, month, day)
    .map((canvas) => new google.maps.GroundOverlay(canvas.toDataURL(), bounds));

  if (!['monthlyFlux', 'hourlyShade'].includes(layer.id)) {
    overlays[0].setMap(map);
  }
  console.log(overlays);
  return overlays;
}
async function getBuildingInsights(lat, long, apiKey){
  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${long}&requiredQuality=HIGH&key=${apiKey}`;
  try{
    const response = await fetch(url);
    return response.json();
  } catch (error){
    console.log("Error in fetching building insights: ", error);
  }
}

async function getDataLayers(location, apiKey) {
  const url = `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${location.latitude}&location.longitude=${location.longitude}&radiusMeters=100&view=FULL_LAYERS&requiredQuality=HIGH&exactQualityRequired=true&pixelSizeMeters=0.5&key=${apiKey}`;
  try {
    const response = await fetch(url);

    // Check if the response is not successful
    if (!response.ok) {
      const errorText = await response.text(); // Fetch the error response as text
      console.error('API returned an error:', errorText);
      throw new Error(`Failed to fetch data layers: ${response.status} ${response.statusText}`);
    }

    // Parse the response as JSON
    const data = await response.json();
    console.log('Data layers response: ', data);

    return data;
  } catch (error) {
    console.error("Error in fetching data layers: ", error);
    return null; // Return null or handle appropriately in the caller function
  }
}

// Route to fetch GeoTIFF data


app.get('/getraster', async (req, res) => {
  const lat = req.query.lat;
  const long = req.query.long;
  try{
    const buildingInsightsResponse = await getBuildingInsights(lat, long, apiKey);
    buildingInsights = buildingInsightsResponse;
    const center = buildingInsights.center;
    try{
      const dataLayersResponse = await getDataLayers(center, apiKey);
      console.log("Data layers response: ", dataLayersResponse);
      try{
        const tiffResponse = await showDataLayer();
        res.status(200).json(tiffResponse);
      } catch(error){
        console.log("Error in fetching tiff response: ", error);
      }
    } catch(error){
      console.log("Error in fetching data layers: ", error);
    }
  } catch(error){
    console.log("Error in fetching building insights: ", error);
  }
})

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});