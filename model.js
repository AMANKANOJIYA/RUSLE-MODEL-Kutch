//////////////////////////////////////////////////////////////////////////////
// RUSLE MODEL FOR SOIL EROSION ASSESSMENT IN KACHCHH DISTRICT, GUJARAT, INDIA
// Author: [Your Name]
// Date: April 21, 2025
//////////////////////////////////////////////////////////////////////////////

/**
 * This script implements the Revised Universal Soil Loss Equation (RUSLE) to estimate 
 * soil erosion in the Kachchh district of Gujarat, India. The RUSLE model calculates  
 * soil loss using the equation: A = R * K * LS * C * P, where:
 * 
 * A = Annual soil loss (t/ha/yr)
 * R = Rainfall erosivity factor (MJ·mm/ha·h·yr)
 * K = Soil erodibility factor (t·ha·h/ha·MJ·mm)
 * LS = Slope length and steepness factor (dimensionless)
 * C = Cover management factor (dimensionless)
 * P = Support practice factor (dimensionless)
 */

/////////////// Define Data Sources /////////////////////
var CHIRPS = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY");
var soil = ee.Image("OpenLandMap/SOL/SOL_TEXTURE-CLASS_USDA-TT_M/v02");
var DEM = ee.Image("USGS/SRTMGL1_003");
var s2 = ee.ImageCollection("COPERNICUS/S2_HARMONIZED");
var modis = ee.ImageCollection("MODIS/061/MCD12Q1");

///////////////////// Define Study Area /////////////////////
var aoi = ee.FeatureCollection('projects/ee-radhikak412003/assets/Kachchh');
Map.addLayer(aoi, {color: 'blue'}, 'Kutch District Boundary');
Map.centerObject(aoi, 7);  // Set zoom level

//////////// Define Sub Unit Field Name ////////////////
var subUnit_ID = 'HYBAS_ID'; // for HydroSHEDS boundaries

///////////////////// 30-YEAR PRECIPITATION ANALYSIS /////////////////////
/**
 * Analyzes 30 years (1991-2023) of precipitation data to calculate the 
 * rainfall erosivity factor (R)
 */
// Set analysis period (1991-2023)
var startYear = 1991;
var endYear = 2023;

// Function to calculate annual precipitation
function getAnnualPrecip(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = ee.Date.fromYMD(year, 12, 31);
  return CHIRPS
    .filterDate(start, end)
    .select('precipitation')
    .sum()
    .clip(aoi)
    .set('year', year);
}

// Process all years
var annualPrecip = ee.ImageCollection(
  ee.List.sequence(startYear, endYear).map(getAnnualPrecip)
);

// Calculate mean annual precipitation
var meanAnnual = annualPrecip.mean();

// Visualize rainfall
Map.addLayer(meanAnnual, {
  min: 200,
  max: 600,
  palette: ['white', 'blue', 'darkblue', 'darkred']
}, 'Mean Annual Rainfall (mm) 1991-2023', 1);

// Calculate R Factor using the equation R = 0.363 * rainfall + 79
var R = meanAnnual.multiply(0.363).add(79).rename('R');
Map.addLayer(R, {
  min: 150,
  max: 300,
  palette: ['a52508','ff3818','fbff18','25cdff','2f35ff','0b2dab']
}, 'R Factor (30-year mean)', 0);

///////////////////// SOIL EROSION FACTORS /////////////////////

/**
 * Calculate K Factor (Soil Erodibility)
 * K factor represents the susceptibility of soil to erosion based on soil texture
 */
soil = soil.select('b0').clip(aoi).rename('Soil');
Map.addLayer(soil, {
  min: 0, 
  max: 100, 
  palette: ['a52508','ff3818','fbff18','25cdff','2f35ff','0b2dab']
}, 'Soil Texture Class', 0);

// Convert soil texture class to K factor values
var K = soil.expression(
  "(b('Soil') > 11) ? 0.0053" +
  ": (b('Soil') > 10) ? 0.0170" +
  ": (b('Soil') > 9) ? 0.045" +
  ": (b('Soil') > 8) ? 0.050" +
  ": (b('Soil') > 7) ? 0.0499" +
  ": (b('Soil') > 6) ? 0.0394" +
  ": (b('Soil') > 5) ? 0.0264" +
  ": (b('Soil') > 4) ? 0.0423" +
  ": (b('Soil') > 3) ? 0.0394" +
  ": (b('Soil') > 2) ? 0.036" +
  ": (b('Soil') > 1) ? 0.0341" +
  ": (b('Soil') > 0) ? 0.0288" +
  ": 0"
).rename('K').clip(aoi);

Map.addLayer(K, {
  min: 0, 
  max: 0.06, 
  palette: ['a52508','ff3818','fbff18','25cdff','2f35ff','0b2dab']
}, 'K Factor Map', 0);

/**
 * Calculate LS Factor (Slope Length and Steepness)
 * LS factor accounts for the effect of topography on erosion
 */
var elevation = DEM.select('elevation');
var slope1 = ee.Terrain.slope(elevation).clip(aoi);
// Convert slope from degrees to percentage
var slope = slope1.divide(180).multiply(Math.PI).tan().multiply(100);
Map.addLayer(slope, {
  min: 0, 
  max: 15, 
  palette: ['a52508','ff3818','fbff18','25cdff','2f35ff','0b2dab']
}, 'Slope in %', 0);

// Calculate LS factor using the equation: LS = (0.53*S + 0.076*S^2 + 0.76) * sqrt(500/100)
// where S is slope in percentage
var LS4 = Math.sqrt(500/100); // Adjusted slope length factor
var LS3 = ee.Image(slope.multiply(0.53));
var LS2 = ee.Image(slope).multiply(ee.Image(slope).multiply(0.076));
var LS1 = ee.Image(LS3).add(LS2).add(0.76);
var LS = ee.Image(LS1).multiply(LS4).rename("LS");

Map.addLayer(LS, {
  min: 0, 
  max: 90, 
  palette: ['a52508','ff3818','fbff18','25cdff','2f35ff','0b2dab']
}, 'LS Factor Map', 0);

/**
 * Calculate C Factor (Cover Management)
 * C factor represents the effect of cropping and management practices on soil erosion
 * Here we use NDVI (Normalized Difference Vegetation Index) as a proxy
 */
// Using recent year for NDVI calculation
var date1 = '2023-01-01';
var date2 = '2024-01-01';

var s2_median = s2.filterDate(date1, date2).median().clip(aoi);
var image_ndvi = s2_median.normalizedDifference(['B8','B4']).rename("NDVI");
Map.addLayer(image_ndvi, {
  min: 0, 
  max: 0.85, 
  palette: ['FFFFFF','CC9966','CC9900', '996600', '33CC00', '009900','006600','000000']
}, 'NDVI', 0);

// Calculate C factor from NDVI using exponential relationship
var alpha = ee.Number(-2);
var beta = ee.Number(1);

var C1 = image_ndvi.multiply(alpha);
var oneImage = ee.Image(1).clip(aoi);
var C2 = oneImage.subtract(image_ndvi);
var C3 = C1.divide(C2).rename('C3');
var C4 = C3.exp();

// Normalize C factor to [0,1] range
var maxC4 = C4.reduceRegion({
  geometry: aoi,
  reducer: ee.Reducer.max(),
  scale: 300,
  maxPixels: 1e12
});

var C5 = maxC4.toImage().clip(aoi);
var minC4 = C4.reduceRegion({
  geometry: aoi,
  reducer: ee.Reducer.min(),
  scale: 300,
  maxPixels: 1e12
});

var C6 = minC4.toImage().clip(aoi);
var C7 = C4.subtract(C6);
var C8 = C5.subtract(C6);

var C = C7.divide(C8).rename('C');
Map.addLayer(C, {
  min: 0, 
  max: 1, 
  palette: ['FFFFFF','CC9966','CC9900', '996600', '33CC00', '009900','006600','000000']
}, 'C Factor Map', 0);

/**
 * Calculate P Factor (Support Practices)
 * P factor reflects the impact of support practices on soil erosion
 * Based on land use/land cover and slope
 */
var lulc = modis.filterDate(date1, date2)
  .select('LC_Type1')
  .first()
  .clip(aoi)
  .rename('LU_LC');

var dict = {
  "names":["waterbodies","trees","grassland","cropland","shrub/scrub","builtup area","barren","wetland"],
  "colors":["#1c0dff","#009900","#b6ff05","#c24f44","#c6b044","#a5a5a5","#f9ffa4","#27ff87"]
};

Map.addLayer(lulc, {
  min: 0, 
  max: 30,
  palette: ["#1c0dff","#009900","#b6ff05","#c24f44","#c6b044","#a5a5a5","#f9ffa4","#27ff87"]
}, 'Land Use/Land Cover', 0);

// Combined LULC & slope
var lulc_slope = lulc.addBands(slope);

// Create P Factor map based on land use and slope characteristics
var P = lulc_slope.expression(
  "(b('LU_LC') < 11) ? 0.8" +
  ": (b('LU_LC') == 11) ? 1" +
  ": (b('LU_LC') == 13) ? 1" +
  ": (b('LU_LC') > 14) ? 1" +
  ": (b('slope') < 2) and((b('LU_LC')==12) or (b('LU_LC')==14)) ? 0.6" +
  ": (b('slope') < 5) and((b('LU_LC')==12) or (b('LU_LC')==14)) ? 0.5" +
  ": (b('slope') < 8) and((b('LU_LC')==12) or (b('LU_LC')==14)) ? 0.5" +
  ": (b('slope') < 12) and((b('LU_LC')==12) or (b('LU_LC')==14)) ? 0.6" +
  ": (b('slope') < 16) and((b('LU_LC')==12) or (b('LU_LC')==14)) ? 0.7" +
  ": (b('slope') < 20) and((b('LU_LC')==12) or (b('LU_LC')==14)) ? 0.8" +
  ": (b('slope') > 20) and((b('LU_LC')==12) or (b('LU_LC')==14)) ? 0.9" +
  ": 1"
).rename('P').clip(aoi);
Map.addLayer(P, {}, 'P Factor', 0);

/**
 * Calculate Soil Loss (RUSLE Equation: A = R * K * LS * C * P)
 * Final estimation of soil erosion in tons/hectare/year
 */
var soil_loss = R.multiply(K)
                .multiply(LS)
                .multiply(C)
                .multiply(P)
                .rename('SoilLoss');

var style = ['490eff','12f4ff','12ff50','e5ff12','ff4812'];
Map.addLayer(soil_loss, {
  min: 0, 
  max: 10, 
  palette: style
}, 'Soil Loss (t/ha/yr)', 0);

// Classify soil loss into erosion severity classes
var SL_class = soil_loss.expression(
  "(b('SoilLoss') < 5) ? 1" +
  ": (b('SoilLoss') < 10) ? 2" +
  ": (b('SoilLoss') < 20) ? 3" +
  ": (b('SoilLoss') < 40) ? 4" +
  ": 5"
).rename('SL_class').clip(aoi);

Map.addLayer(SL_class, {
  min: 1, 
  max: 5, 
  palette: style
}, 'Soil Loss Class');

/////////////////////// STATISTICS AND ANALYSIS /////////////////////////

// Calculate mean soil loss for entire area
var SL_mean = soil_loss.reduceRegion({
  geometry: aoi,
  reducer: ee.Reducer.mean(),
  scale: 300,
  maxPixels: 1e12
});

print("Mean Soil Loss (t/ha/yr)", SL_mean.get("SoilLoss"));

// Calculate mean soil loss for each sub-basin
var subbasinMeans = soil_loss.reduceRegions({
  collection: aoi,
  reducer: ee.Reducer.mean(),
  scale: 300,
});

print("Mean Soil Loss by Subbasin (t/ha/yr)", subbasinMeans);

// Calculate area of each soil loss class
var areaImage = ee.Image.pixelArea().addBands(SL_class);
var areas = areaImage.reduceRegion({
  reducer: ee.Reducer.sum().group({
    groupField: 1,
    groupName: 'class',
  }),
  geometry: aoi.geometry(),
  scale: 300,
  maxPixels: 1e12
});

var classAreas = ee.List(areas.get('groups'));
var className = classAreas.map(function(item) {
  var areaDict = ee.Dictionary(item);
  var classNumber = ee.Number(areaDict.get('class')).format();
  return ee.List(classNumber);
});

var Area = classAreas.map(function(item) {
  var areaDict = ee.Dictionary(item);
  var area = ee.Number(areaDict.get('sum')).divide(1e6).round();
  return ee.List(area);
});

var className2 = ee.List([
  "Slight (<5)",
  "Moderate (5-10)",
  "High (10-20)",
  "Very high (20-40)",
  "Severe (>40)"
]);

// Create a pie chart showing soil loss class distribution
print(ui.Chart.array.values(Area, 0, className2)
  .setChartType('PieChart')
  .setOptions({
    title: 'Soil Loss Distribution by Class',
    slices: {0: {color: '#490eff'}, 1: {color: '#12f4ff'}, 2: {color: '#12ff50'}, 
             3: {color: '#e5ff12'}, 4: {color: '#ff4812'}},
    legend: {position: 'right'}
  }));

// Calculate area by class for each subbasin
var calculateClassArea = function(feature) {
  var areas = ee.Image.pixelArea().addBands(SL_class)
    .reduceRegion({
      reducer: ee.Reducer.sum().group({
        groupField: 1,
        groupName: 'class',
      }),
      geometry: feature.geometry(),
      scale: 300,
      maxPixels: 1e12
    });

  var classAreas = ee.List(areas.get('groups'));
  var classAreaLists = classAreas.map(function(item) {
    var areaDict = ee.Dictionary(item);
    var classNumber = ee.Number(areaDict.get('class')).format();
    var area = ee.Number(areaDict.get('sum')).round();
    return ee.List([classNumber, area]);
  });

  var result = ee.Dictionary(classAreaLists.flatten());
  var district = feature.get(subUnit_ID);
  return ee.Feature(
    feature.geometry(),
    result.set('district', district));
};

var districtAreas = aoi.map(calculateClassArea);

var classes = ee.List.sequence(1, 5);
var outputFields = ee.List(['district']).cat(classes).getInfo();

// Export results to Google Drive
Export.table.toDrive({
  collection: districtAreas,
  description: 'class_area_by_subbasin',
  folder: 'earthengine',
  fileNamePrefix: 'soil_loss_class_area_by_subbasin',
  fileFormat: 'CSV',
  selectors: outputFields
});

/////////////////////// LEGENDS AND MAP FEATURES /////////////////////////

/**
 * Create interactive legends and map features for better visualization
 */

// Create a panel to hold the legend for soil loss classes
var soilLossLegend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 15px'
  }
});

// Create legend title
var legendTitle = ui.Label({
  value: 'Soil Loss Class (t/ha/yr)',
  style: {
    fontWeight: 'bold',
    fontSize: '16px',
    margin: '0 0 4px 0',
    padding: '0'
  }
});

// Add the title to the panel
soilLossLegend.add(legendTitle);

// Function to create legend rows
var makeRow = function(color, name) {
  // Create the colored box
  var colorBox = ui.Label({
    style: {
      backgroundColor: '#' + color,
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });

  // Create the description label
  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });

  // Return the panel with both elements
  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};

// Define the color palette (matches your soil loss visualization)
var palette = ['490eff', '12f4ff', '12ff50', 'e5ff12', 'ff4812'];

// Define the class names and ranges (matches your classification)
var classNames = [
  'Slight (<5)',
  'Moderate (5-10)',
  'High (10-20)',
  'Very high (20-40)',
  'Severe (>40)'
];

// Add each class to the legend
for (var i = 0; i < palette.length; i++) {
  soilLossLegend.add(makeRow(palette[i], classNames[i]));
}

// Add legend to the map
Map.add(soilLossLegend);

/**
 * Function to create a generic legend for all types of layers
 */
function addLegend(title, colors, labels, position) {
  var legend = ui.Panel({
    style: {
      position: position || 'bottom-right',
      padding: '8px 15px'
    }
  });
  
  // Add legend title
  var legendTitle = ui.Label({
    value: title,
    style: {
      fontWeight: 'bold',
      fontSize: '14px',
      margin: '0 0 4px 0',
      padding: '0'
    }
  });
  legend.add(legendTitle);
  
  // Create the legend content
  var makeRow = function(color, label) {
    // Create the color box
    var colorBox = ui.Label({
      style: {
        backgroundColor: color,
        padding: '8px',
        margin: '0 0 4px 0'
      }
    });
    
    // Create the label
    var description = ui.Label({
      value: label,
      style: {
        margin: '0 0 4px 6px'
      }
    });
    
    return ui.Panel({
      widgets: [colorBox, description],
      layout: ui.Panel.Layout.Flow('horizontal')
    });
  };
  
  // Add rows to the legend
  for (var i = 0; i < colors.length; i++) {
    legend.add(makeRow(colors[i], labels[i]));
  }
  
  // Add the legend to the map
  Map.add(legend);
}

// Create legends for all map layers
// 1. Mean Annual Rainfall in (mm) Legend
var rainColors = ['white', 'blue', 'darkblue', 'darkred'];
var rainLabels = ['200 mm', '400 mm', '600 mm', '>600 mm'];
addLegend('Mean Annual Rainfall (mm)', rainColors, rainLabels, 'bottom-right');

// 2. Soil Texture Class Legend
var soilColors = ['#a52508', '#ff3818', '#fbff18', '#25cdff', '#2f35ff', '#0b2dab'];
var soilLabels = [
  'Coarse', 
  'Moderately coarse', 
  'Medium', 
  'Moderately fine', 
  'Fine', 
  'Very fine'
];
addLegend('Soil Texture Class', soilColors, soilLabels, 'bottom-right');

// 3. Slope in (%) Legend
var slopeColors = ['#a52508', '#ff3818', '#fbff18', '#25cdff', '#2f35ff', '#0b2dab'];
var slopeLabels = ['0-2.5%', '2.5-5%', '5-7.5%', '7.5-10%', '10-12.5%', '>12.5%'];
addLegend('Slope (%)', slopeColors, slopeLabels, 'bottom-right');

// 4. NDVI Legend
var ndviColors = ['#FFFFFF', '#CC9966', '#CC9900', '#996600', '#33CC00', '#009900', '#006600', '#000000'];
var ndviLabels = [
  '0 (No vegetation)', 
  '0.1', 
  '0.2', 
  '0.3', 
  '0.5 (Moderate vegetation)', 
  '0.7 (Dense vegetation)',
  '0.8',
  '0.85 (Very dense vegetation)'
];
addLegend('NDVI', ndviColors, ndviLabels, 'bottom-left');

// 5. Land Use/Land Cover Legend
var lulcColors = ["#1c0dff", "#009900", "#b6ff05", "#c24f44", "#c6b044", "#a5a5a5", "#f9ffa4", "#27ff87"];
var lulcLabels = [
  "Waterbodies",
  "Trees",
  "Grassland",
  "Cropland",
  "Shrub/Scrub",
  "Built-up area",
  "Barren",
  "Wetland"
];
addLegend('Land Use/Land Cover', lulcColors, lulcLabels, 'top-left');

/**
 * Create selectable legends for RUSLE factors
 */
function createLegend(position, colors, labels, title) {
  var legend = ui.Panel({
    style: {
      position: position,
      padding: '8px 15px'
    }
  });
  
  // Add legend title
  var legendTitle = ui.Label({
    value: title,
    style: {
      fontWeight: 'bold',
      fontSize: '16px',
      margin: '0 0 4px 0',
      padding: '0'
    }
  });
  legend.add(legendTitle);
  
  // Create the legend content
  var makeRow = function(color, label) {
    var colorBox = ui.Label({
      style: {
        backgroundColor: color,
        padding: '8px',
        margin: '0 0 4px 0'
      }
    });
    
    var labelDescription = ui.Label({
      value: label,
      style: {
        margin: '0 0 4px 6px'
      }
    });
    
    return ui.Panel({
      widgets: [colorBox, labelDescription],
      layout: ui.Panel.Layout.Flow('horizontal')
    });
  };
  
  // Add colors and labels
  for (var i = 0; i < colors.length; i++) {
    legend.add(makeRow(colors[i], labels[i]));
  }
  
  return legend;
}

// Create RUSLE factor legends
// R Factor Legend
var rColors = ['#a52508', '#ff3818', '#fbff18', '#25cdff', '#2f35ff', '#0b2dab'];
var rLabels = ['150-175', '175-200', '200-225', '225-250', '250-275', '275-300'];
var rLegend = createLegend('bottom-left', rColors, rLabels, 'R Factor');

// K Factor Legend
var kColors = ['#a52508', '#ff3818', '#fbff18', '#25cdff', '#2f35ff', '#0b2dab'];
var kLabels = ['0.00-0.01', '0.01-0.02', '0.02-0.03', '0.03-0.04', '0.04-0.05', '0.05-0.06'];
var kLegend = createLegend('bottom-left', kColors, kLabels, 'K Factor');

// LS Factor Legend
var lsColors = ['#a52508', '#ff3818', '#fbff18', '#25cdff', '#2f35ff', '#0b2dab'];
var lsLabels = ['0-15', '15-30', '30-45', '45-60', '60-75', '75-90'];
var lsLegend = createLegend('bottom-left', lsColors, lsLabels, 'LS Factor (unitless)');

// C Factor Legend
var cColors = ['#FFFFFF', '#CC9966', '#CC9900', '#996600', '#33CC00', '#009900', '#006600', '#000000'];
var cLabels = ['0-0.125', '0.125-0.25', '0.25-0.375', '0.375-0.5', '0.5-0.625', '0.625-0.75', '0.75-0.875', '0.875-1.0'];
var cLegend = createLegend('bottom-left', cColors, cLabels, 'C Factor (unitless)');

// P Factor Legend
var pColors = ['#a52508', '#ff3818', '#fbff18', '#25cdff', '#2f35ff', '#0b2dab'];
var pLabels = ['0.5-0.6', '0.6-0.7', '0.7-0.8', '0.8-0.9', '0.9-1.0'];
var pLegend = createLegend('bottom-left', pColors, pLabels, 'P Factor (unitless)');

// Add legends to map (only one at a time to avoid clutter)
Map.add(rLegend);
// Map.add(kLegend);
// Map.add(lsLegend);
// Map.add(cLegend);
// Map.add(pLegend);

// Create a panel to toggle between legends
var legendSelector = ui.Select({
  items: ['R Factor', 'K Factor', 'LS Factor', 'C Factor', 'P Factor'],
  placeholder: 'Select Legend',
  onChange: function(selected) {
    // Remove all legends first
    Map.remove(rLegend);
    Map.remove(kLegend);
    Map.remove(lsLegend);
    Map.remove(cLegend);
    Map.remove(pLegend);
    
    // Add selected legend
    if (selected === 'R Factor') Map.add(rLegend);
    else if (selected === 'K Factor') Map.add(kLegend);
    else if (selected === 'LS Factor') Map.add(lsLegend);
    else if (selected === 'C Factor') Map.add(cLegend);
    else if (selected === 'P Factor') Map.add(pLegend);
  }
});

// Add the selector to the map
Map.add(ui.Panel({
  widgets: [legendSelector],
  style: {
    position: 'top-right',
    padding: '8px'
  }
}));
