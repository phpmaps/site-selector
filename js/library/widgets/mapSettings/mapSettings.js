﻿/*global define,dojo,dojoConfig,alert,esri */
/*jslint browser:true,sloppy:true,nomen:true,unparam:true,plusplus:true,indent:4 */
/*
| Copyright 2013 Esri
|
| Licensed under the Apache License, Version 2.0 (the "License");
| you may not use this file except in compliance with the License.
| You may obtain a copy of the License at
|
|    http://www.apache.org/licenses/LICENSE-2.0
|
| Unless required by applicable law or agreed to in writing, software
| distributed under the License is distributed on an "AS IS" BASIS,
| WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
| See the License for the specific language governing permissions and
| limitations under the License.
*/
//============================================================================================================================//
define([
    "dojo/_base/declare",
    "dojo/dom-construct",
    "dojo/dom-style",
    "dojo/_base/lang",
    "dojo/on",
    "dojo/_base/array",
    "esri/arcgis/utils",
    "dojo/dom",
    "dojo/dom-attr",
    "dojo/query",
    "esri/tasks/query",
    "esri/tasks/QueryTask",
    "dojo/dom-class",
    "dijit/_WidgetBase",
    "dojo/i18n!application/js/library/nls/localizedStrings",
    "esri/map",
    "esri/layers/ImageParameters",
    "esri/layers/FeatureLayer",
    "esri/layers/GraphicsLayer",
    "widgets/baseMapGallery/baseMapGallery",
    "esri/geometry/Extent",
    "esri/dijit/HomeButton",
    "dojo/Deferred",
    "dojo/DeferredList",
    "dojo/topic",
    "esri/layers/ArcGISDynamicMapServiceLayer",
    "widgets/infoWindow/infoWindow",
    "dojo/string",
    "dojo/domReady!"
], function (declare, domConstruct, domStyle, lang, on, array, esriUtils, dom, domAttr, query, Query, QueryTask, domClass, _WidgetBase, sharedNls, esriMap, ImageParameters, FeatureLayer, GraphicsLayer, BaseMapGallery, GeometryExtent, HomeButton, Deferred, DeferredList, topic, ArcGISDynamicMapServiceLayer, InfoWindow, string) {

    //========================================================================================================================//

    return declare([_WidgetBase], {

        map: null,
        tempGraphicsLayerId: "esriGraphicsLayerMapSettings",
        featureGraphicsLayerId: "esriFeatureGraphicsLayer",
        sharedNls: sharedNls,

        /**
        * initialize map object
        *
        * @class
        * @name widgets/mapSettings/mapSettings
        */
        postCreate: function () {
            var mapDeferred;
            topic.publish("showProgressIndicator");

            /**
            * load map
            * @param {string} dojo.configData.BaseMapLayers Basemap settings specified in configuration file
            */

            mapDeferred = esriUtils.createMap(dojo.configData.WebMapId, "esriCTParentDivContainer", {
                mapOptions: {
                    slider: true,
                    showAttribution: dojo.configData.ShowMapAttribution
                },
                ignorePopups: true
            });
            mapDeferred.then(lang.hitch(this, function (response) {
                this.map = response.map;
                dojo.selectedBasemapIndex = null;
                if (response.itemInfo.itemData.baseMap.baseMapLayers) {
                    this._setBasemapLayerId(response.itemInfo.itemData.baseMap.baseMapLayers);
                }
                topic.publish("filterRedundantBasemap", response.itemInfo);
                this._generateLayerURL(response.itemInfo.itemData.operationalLayers);
                topic.subscribe("showInfoWindow", lang.hitch(this, function (mapPoint, featureArray, count, isInfoArrowClicked) {
                    this._createInfoWindowContent(mapPoint, featureArray, count, isInfoArrowClicked);
                }));
                topic.subscribe("setInfoWindowOnMap", lang.hitch(this, function (infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight) {
                    this._onSetInfoWindowPosition(infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight);
                }));
                this.infoWindowPanel = new InfoWindow({ infoWindowWidth: dojo.configData.InfoPopupWidth, infoWindowHeight: dojo.configData.InfoPopupHeight });

                this._fetchWebMapData(response);
                topic.publish("setMap", this.map);

                topic.publish("hideProgressIndicator");
                this._mapOnLoad();
                this._activateMapEvents(response);
            }));
        },

        /**
        * update infowindow content when it's position is set on map
        * @memberOf widgets/mapSettings/mapSettings
        */
        _onSetInfoWindowPosition: function (infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight) {
            this.infoWindowPanel.resize(infoPopupWidth, infoPopupHeight);
            this.infoWindowPanel.hide();
            this.infoWindowPanel.setTitle(infoTitle);
            domStyle.set(query(".esriCTinfoWindow")[0], "visibility", "visible");
            this.infoWindowPanel.show(divInfoDetailsTab, screenPoint);
            dojo.infoWindowIsShowing = true;
            this._onSetMapTipPosition(screenPoint);
        },

        /**
        * set infowindow anchor position on map
        * @memberOf widgets/locator/locator
        */
        _onSetMapTipPosition: function () {
            if (dojo.selectedMapPoint) {
                var screenPoint = this.map.toScreen(dojo.selectedMapPoint);
                screenPoint.y = this.map.height - screenPoint.y;
                this.infoWindowPanel.setLocation(screenPoint);
            }
        },

        /**
        * fetch webmap operational layers and generate settings
        * @memberOf widgets/mapSettings/mapSettings
        */
        _fetchWebMapData: function (response) {
            var str, webMapDetails, serviceTitle, operationalLayerId, lastIndex, infowindowCurrentSettings = [], i, j, k, lastSlashIndex, idx, popupField, layerSearchSetting, webmapSearchSettings = [], flowIndex;
            for (flowIndex = 0; flowIndex < dojo.configData.Workflows.length; flowIndex++) {
                if (dojo.configData.Workflows[flowIndex].SearchSettings) {
                    webMapDetails = response.itemInfo.itemData;
                    serviceTitle = [];
                    for (i = 0; i < webMapDetails.operationalLayers.length; i++) {
                        operationalLayerId = lang.trim(webMapDetails.operationalLayers[i].title);
                        str = webMapDetails.operationalLayers[i].url.split('/');
                        lastIndex = str[str.length - 1];
                        if (isNaN(lastIndex) || lastIndex === "") {
                            if (lastIndex === "") {
                                serviceTitle[operationalLayerId] = webMapDetails.operationalLayers[i].url;
                            } else {
                                serviceTitle[operationalLayerId] = webMapDetails.operationalLayers[i].url + "/";
                            }
                        } else {
                            lastSlashIndex = array.lastIndexOf(webMapDetails.operationalLayers[i].url, "/");
                            serviceTitle[operationalLayerId] = webMapDetails.operationalLayers[i].url.substring(0, lastSlashIndex + 1);
                        }
                    }
                    k = 0;
                    this.operationalLayers = [];
                    for (j = 0; j < webMapDetails.operationalLayers.length; j++) {
                        str = webMapDetails.operationalLayers[k].url.split('/');
                        lastIndex = str[str.length - 1];
                        i = webmapSearchSettings.length;
                        layerSearchSetting = this._getConfigSearchSetting(lastIndex, flowIndex);
                        if (layerSearchSetting) {
                            webmapSearchSettings[i] = layerSearchSetting;
                            this.operationalLayers[i] = webMapDetails.operationalLayers[j];
                            webmapSearchSettings[i].QueryURL = this.operationalLayers[i].url;
                            if (this.operationalLayers[i].popupInfo) {
                                //infowindowCurrentSettings[i] = this._getConfigInfoData(webmapSearchSettings[i].QueryLayerId);
                                if (!infowindowCurrentSettings[i]) {
                                    infowindowCurrentSettings[i] = {};
                                    infowindowCurrentSettings[i].QueryLayerId = webmapSearchSettings[i].QueryLayerId;
                                }
                                infowindowCurrentSettings[i].InfoQueryURL = this.operationalLayers[i].url;
                                if (this.operationalLayers[i].popupInfo.title.split("{").length > 1) {
                                    infowindowCurrentSettings[i].InfoWindowHeaderField = dojo.string.trim(this.operationalLayers[i].popupInfo.title.split("{")[0]);
                                    for (idx = 1; idx < this.operationalLayers[i].popupInfo.title.split("{").length; idx++) {
                                        infowindowCurrentSettings[i].InfoWindowHeaderField += " ${" + dojo.string.trim(this.operationalLayers[i].popupInfo.title.split("{")[idx]);
                                    }
                                } else {
                                    if (dojo.string.trim(this.operationalLayers[i].popupInfo.title) !== "") {
                                        infowindowCurrentSettings[i].InfoWindowHeaderField = dojo.string.trim(this.operationalLayers[i].popupInfo.title);
                                    } else {
                                        infowindowCurrentSettings[i].InfoWindowHeaderField = dojo.configData.ShowNullValueAs;
                                    }
                                }
                                infowindowCurrentSettings[i].InfoWindowData = [];
                                for (popupField in this.operationalLayers[i].popupInfo.fieldInfos) {
                                    if (this.operationalLayers[i].popupInfo.fieldInfos.hasOwnProperty(popupField)) {
                                        if (this.operationalLayers[i].popupInfo.fieldInfos[popupField].visible) {
                                            infowindowCurrentSettings[i].InfoWindowData.push({
                                                "DisplayText": this.operationalLayers[i].popupInfo.fieldInfos[popupField].label + ":",
                                                "FieldName": "${" + this.operationalLayers[i].popupInfo.fieldInfos[popupField].fieldName + "}"
                                            });
                                        }
                                    }
                                }
                            }
                            k++;
                        } else { k++; }
                    }
                    dojo.configData.Workflows[flowIndex].InfowindowSettings = infowindowCurrentSettings;
                }
            }

        },

        /**
        * get search setting from config
        * @param{string} searchKey is layer id to find search setting in config
        * @memberOf widgets/mapSettings/mapSettings
        */
        _getConfigSearchSetting: function (searchKey, workFlowIndex) {
            var i, configSearchSettings = dojo.configData.Workflows[workFlowIndex].SearchSettings;
            for (i = 0; i < configSearchSettings.length; i++) {
                if (configSearchSettings[i].QueryLayerId === searchKey) {
                    return configSearchSettings[i];
                }
            }
            if (i === configSearchSettings.length) {
                return false;
            }

        },

        /**
        * activate events on map
        * @memberOf widgets/mapSettings/mapSettings
        */
        _activateMapEvents: function (webMapRresponse) {
            this.map.on("click", lang.hitch(this, function (evt) {
                var i;
                dojo.mapClickedPoint = evt.mapPoint;
                if (evt.graphic) {
                    for (i = 0; i < dojo.configData.Workflows.length; i++) {
                        topic.publish("loadingIndicatorHandler");
                        this._showInfoWindowOnMap(evt.mapPoint, webMapRresponse);
                    }
                }
            }));
            this.map.on("extent-change", lang.hitch(this, function (evt) {
                this._onSetMapTipPosition();
            }));
        },

        /**
        * show infowindow on map
        * @param{object} mapPoint is location on map to show infowindow
        * @memberOf widgets/mapSettings/mapSettings
        */
        _showInfoWindowOnMap: function (mapPoint, webMapRresponse) {
            var onMapFeaturArray, index, deferredListResult, featureArray, j, i, k;
            onMapFeaturArray = [];
            for (index = 0; index < dojo.configData.Workflows.length; index++) {
                if (dojo.configData.Workflows[index].SearchSettings && dojo.configData.Workflows[index].SearchSettings[0].QueryURL) {
                    for (k = 0; k < webMapRresponse.itemInfo.itemData.operationalLayers.length; k++) {
                        if (dojo.configData.Workflows[index].SearchSettings[0].QueryURL === webMapRresponse.itemInfo.itemData.operationalLayers[k].url && webMapRresponse.itemInfo.itemData.operationalLayers[k].layerObject.visibleAtMapScale) {
                            this._executeQueryTask(index, mapPoint, dojo.configData.Workflows[index].SearchSettings[0].QueryURL, onMapFeaturArray, webMapRresponse);
                            break;
                        }
                    }
                }
            }
            deferredListResult = new DeferredList(onMapFeaturArray);
            featureArray = [];
            deferredListResult.then(lang.hitch(this, function (result) {
                if (result) {
                    for (j = 0; j < result.length; j++) {
                        if (result[j][1]) {
                            if (result[j][1].features.length > 0) {
                                for (i = 0; i < result[j][1].features.length; i++) {
                                    featureArray.push({
                                        attr: result[j][1].features[i],
                                        layerIndex: j,
                                        fields: result[j][1].fields
                                    });
                                }
                            }
                        }
                    }

                    this._fetchQueryResults(featureArray, mapPoint);
                }
            }), function (err) {
                alert(err.message);
            });
        },

        /**
        * fetch infowindow data from query task result
        * @memberOf widgets/mapSettings/mapSettings
        */
        _fetchQueryResults: function (featureArray, mapPoint) {
            var point, _this, featurePoint;
            if (featureArray.length > 0) {
                if (featureArray.length === 1) {
                    domClass.remove(query(".esriCTdivInfoRightArrow")[0], "esriCTShowInfoRightArrow");
                    if (featureArray[0].attr.geometry.type === "polygon") {
                        featurePoint = mapPoint;
                    } else {
                        featurePoint = featureArray[0].attr.geometry;
                    }
                    topic.publish("showInfoWindow", featurePoint, featureArray, 0, false);
                } else {
                    this.count = 0;
                    domAttr.set(query(".esriCTdivInfoTotalFeatureCount")[0], "innerHTML", '/' + featureArray.length);
                    if (featureArray[this.count].attr.geometry.type === "polyline") {
                        point = featureArray[this.count].attr.geometry.getPoint(0, 0);
                        topic.publish("showInfoWindow", point, featureArray, this.count, false);
                    } else {
                        if (featureArray[0].attr.geometry.type === "polygon") {
                            point = mapPoint;
                        } else {
                            point = featureArray[0].attr.geometry;
                        }
                        topic.publish("showInfoWindow", point, featureArray, this.count, false);
                    }
                    topic.publish("hideLoadingIndicatorHandler");
                    _this = this;
                    query(".esriCTdivInfoRightArrow")[0].onclick = function () {
                        _this._nextInfoContent(featureArray, point);
                    };
                    query(".esriCTdivInfoLeftArrow")[0].onclick = function () {
                        _this._previousInfoContent(featureArray, point);
                    };
                }
            } else {
                topic.publish("hideLoadingIndicatorHandler");
            }
        },
        /**
        * execute query task to find infowindow data
        * @param{string} index is layer index in operational layer array
        * @memberOf widgets/mapSettings/mapSettings
        */
        _executeQueryTask: function (index, mapPoint, QueryURL, onMapFeaturArray, webMapRresponse) {
            var esriQuery, queryTask, queryOnRouteTask, currentTime;
            queryTask = new QueryTask(QueryURL);
            esriQuery = new Query();
            currentTime = new Date();
            esriQuery.where = currentTime.getTime() + index.toString() + "=" + currentTime.getTime() + index.toString();
            esriQuery.returnGeometry = true;
            esriQuery.geometry = this._extentFromPoint(mapPoint);
            esriQuery.spatialRelationship = Query.SPATIAL_REL_INTERSECTS;
            esriQuery.outSpatialReference = this.map.spatialReference;
            esriQuery.outFields = ["*"];
            queryOnRouteTask = queryTask.execute(esriQuery, lang.hitch(this, function (results) {
                var deferred = new Deferred();
                deferred.resolve(results);
                return deferred.promise;
            }), function (err) {
                alert(err.message);
            });
            onMapFeaturArray.push(queryOnRouteTask);
        },

        /**
        * get extent from mappoint
        * @memberOf widgets/mapSettings/mapSettings
        */
        _extentFromPoint: function (point) {
            var screenPoint, sourcePoint, destinationPoint, sourceMapPoint, destinationMapPoint, tolerance = 15;
            screenPoint = this.map.toScreen(point);
            sourcePoint = new esri.geometry.Point(screenPoint.x - tolerance, screenPoint.y + tolerance);
            destinationPoint = new esri.geometry.Point(screenPoint.x + tolerance, screenPoint.y - tolerance);
            sourceMapPoint = this.map.toMap(sourcePoint);
            destinationMapPoint = this.map.toMap(destinationPoint);
            return new GeometryExtent(sourceMapPoint.x, sourceMapPoint.y, destinationMapPoint.x, destinationMapPoint.y, this.map.spatialReference);
        },

        /**
        * set default id for basemaps
        * @memberOf widgets/mapSettings/mapSettings
        */
        _setBasemapLayerId: function (baseMapLayers) {
            var i = 0, defaultId = "defaultBasemap";
            if (baseMapLayers.length === 1) {
                this._setBasemapId(baseMapLayers[0], defaultId);
            } else {
                for (i = 0; i < baseMapLayers.length; i++) {
                    this._setBasemapId(baseMapLayers[i], defaultId + i);
                }
            }

        },

        /**
        * set default id for each basemap of webmap
        * @memberOf widgets/mapSettings/mapSettings
        */
        _setBasemapId: function (basmap, defaultId) {
            var layerIndex;
            this.map.getLayer(basmap.id).id = defaultId;
            this.map._layers[defaultId] = this.map.getLayer(basmap.id);
            layerIndex = array.indexOf(this.map.layerIds, basmap.id);
            delete this.map._layers[basmap.id];
            this.map.layerIds[layerIndex] = defaultId;
        },
        /**
        * Get operational layers
        * @param{url} operational layers
        * @memberOf widgets/mapSettings/mapSettings
        */
        _generateLayerURL: function (operationalLayers) {
            var i, str;
            for (i = 0; i < operationalLayers.length; i++) {
                str = operationalLayers[i].url.split('/');
                this._createLayerURL(str, operationalLayers[i]);
            }
        },


        /**
        * Generate Id and title of operational layers
        * @param{string} string value of layer ul
        * @memberOf widgets/mapSettings/mapSettings
        */
        _createLayerURL: function (str, layerObject) {
            var layerTitle, layerId, index, searchSettings, i;
            for (i = 0; i < dojo.configData.Workflows.length; i++) {
                searchSettings = dojo.configData.Workflows[i].SearchSettings;
                layerTitle = layerObject.title;
                layerId = str[str.length - 1];
                if (searchSettings) {
                    for (index = 0; index < searchSettings.length; index++) {
                        if (searchSettings[index].Title && searchSettings[index].QueryLayerId) {
                            if (layerTitle === searchSettings[index].Title && layerId === searchSettings[index].QueryLayerId) {
                                searchSettings[index].QueryURL = str.join("/");
                            }
                        }
                    }
                } else if (dojo.configData.Workflows[i].FilterSettings.FilterLayer) {
                    if (dojo.configData.Workflows[i].FilterSettings.FilterLayer.Title && dojo.configData.Workflows[i].FilterSettings.FilterLayer.QueryLayerId) {
                        if (layerTitle === dojo.configData.Workflows[i].FilterSettings.FilterLayer.Title && layerId === dojo.configData.Workflows[i].FilterSettings.FilterLayer.QueryLayerId) {
                            dojo.configData.Workflows[i].FilterSettings.FilterLayer.LayerURL = str.join("/");
                        }
                    }

                }
            }

        },

        /**
        * Specify basemap feature
        * @param{object} create basemap instance
        * @param{string} web map info
        * @memberOf widgets/mapSettings/mapSettings
        */
        _appendBasemap: function (basemap, webmapInfo) {
            var appendLayer = true, thumbnailSrc;
            array.some(dojo.configData.BaseMapLayers, lang.hitch(this, function (layer) {
                if (layer.MapURL === basemap.url) {
                    appendLayer = false;
                    return true;
                }
            }));
            if (appendLayer) {
                thumbnailSrc = (webmapInfo.thumbnail === null) ? dojo.configData.NoThumbnail : dojo.configData.PortalAPIURL + "content/items/" + webmapInfo.id + "/info/" + webmapInfo.thumbnail;
                dojo.configData.BaseMapLayers.push({
                    ThumbnailSource: thumbnailSrc,
                    Name: webmapInfo.title,
                    MapURL: basemap.url
                });
            }
        },

        _mapOnLoad: function () {
            var home, mapDefaultExtent, graphicsLayer, imgCustomLogo, extent, featureGrapgicLayer, CustomLogoUrl = dojo.configData.CustomLogoUrl, imgSource;

            /**
            * set map extent to default extent specified in configuration file
            * @param {string} dojo.configData.DefaultExtent Default extent of map specified in configuration file
            */

            extent = this._getQueryString('extent');
            if (extent !== "") {
                mapDefaultExtent = extent.split(',');
                mapDefaultExtent = new GeometryExtent({ "xmin": parseFloat(mapDefaultExtent[0]), "ymin": parseFloat(mapDefaultExtent[1]), "xmax": parseFloat(mapDefaultExtent[2]), "ymax": parseFloat(mapDefaultExtent[3]), "spatialReference": { "wkid": this.map.spatialReference.wkid} });
                this.map.setExtent(mapDefaultExtent);
            }
            /**
            * load esri 'Home Button' widget
            */
            home = this._addHomeButton();
            domConstruct.place(home.domNode, query(".esriSimpleSliderIncrementButton")[0], "after");
            home.startup();

            if (dojo.configData.CustomLogoUrl && lang.trim(dojo.configData.CustomLogoUrl).length !== 0) {
                if (dojo.configData.CustomLogoUrl.match("http:") || dojo.configData.CustomLogoUrl.match("https:")) {
                    imgSource = dojo.configData.CustomLogoUrl;
                } else {
                    imgSource = dojoConfig.baseURL + dojo.configData.CustomLogoUrl;
                }
                imgCustomLogo = domConstruct.create("img", { "src": imgSource, "class": "esriCTCustomMapLogo" }, dom.byId("esriCTParentDivContainer"));
                domClass.add(imgCustomLogo, "esriCTCustomMapLogoBottom");
            }

            this._showBasMapGallery();
            if (CustomLogoUrl && lang.trim(CustomLogoUrl).length !== 0) {
                if (CustomLogoUrl.match("http:") || CustomLogoUrl.match("https:")) {
                    imgSource = CustomLogoUrl;
                } else {
                    imgSource = dojoConfig.baseURL + CustomLogoUrl;
                }
                domConstruct.create("img", { "src": imgSource, "class": "esriCTMapLogo" }, dom.byId("esriCTParentDivContainer"));
            }

            graphicsLayer = new GraphicsLayer();
            graphicsLayer.id = this.tempGraphicsLayerId;
            this.map.addLayer(graphicsLayer);
            featureGrapgicLayer = new GraphicsLayer();
            featureGrapgicLayer.id = this.featureGraphicsLayerId;
            this.map.addLayer(featureGrapgicLayer);
        },

        _getQueryString: function (key) {
            var extentValue = "", regex, qs;
            regex = new RegExp("[\\?&]" + key + "=([^&#]*)");
            qs = regex.exec(window.location.href);
            if (qs && qs.length > 0) {
                extentValue = qs[1];
            }
            return extentValue;
        },


        /**
        * load esri 'Home Button' widget which sets map extent to default extent
        * @return {object} Home button widget
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addHomeButton: function () {
            var home = new HomeButton({
                map: this.map
            }, domConstruct.create("div", {}, null));
            return home;
        },

        /**
        * Crate an object of base map gallery
        * @return {object} base map object
        * @memberOf widgets/mapSettings/mapSettings
        */
        _showBasMapGallery: function () {
            var basMapGallery = new BaseMapGallery({
                map: this.map
            }, domConstruct.create("div", {}, null));
            return basMapGallery;
        },
        /* return current map instance
        * @return {object} Current map instance
        * @memberOf widgets/mapSettings/mapSettings
        */
        getMapInstance: function () {
            return this.map;
        },

        /**
        * display next page of infowindow on clicking of next arrow
        * @memberOf widgets/mapSettings/mapSettings
        */
        _nextInfoContent: function (featureArray, point) {
            if (!domClass.contains(query(".esriCTdivInfoRightArrow")[0], "disableArrow")) {
                if (this.count < featureArray.length) {
                    this.count++;
                }
                if (featureArray[this.count]) {
                    domClass.add(query(".esriCTdivInfoRightArrow")[0], "disableArrow");
                    topic.publish("showInfoWindow", point, featureArray, this.count, true);
                }
            }
        },

        /**
        * display previous page of infowindow on clicking of previous arrow
        * @memberOf widgets/mapSettings/mapSettings
        */
        _previousInfoContent: function (featureArray, point) {
            if (!domClass.contains(query(".esriCTdivInfoLeftArrow")[0], "disableArrow")) {
                if (this.count !== 0 && this.count < featureArray.length) {
                    this.count--;
                }
                if (featureArray[this.count]) {
                    domClass.add(query(".esriCTdivInfoLeftArrow")[0], "disableArrow");
                    topic.publish("showInfoWindow", point, featureArray, this.count, true);
                }
            }
        },

        /**
        * create infowindow coontent for selected address
        * @memberOf widgets/locator/locator
        */
        _createInfoWindowContent: function (mapPoint, featureArray, count, isInfoArrowClicked, isFeatureListClicked) {
            var layerSettings, infoPopupFieldsCollection, infoPopupHeight, infoPopupWidth, divInfoDetailsTab, key, screenPoint,
                divInfoRow, i, j, fieldNames, link, divLink, infoTitle, attributes, infoIndex;
            if (featureArray[count].attr && featureArray[count].attr.attributes) {
                attributes = featureArray[count].attr.attributes;
            } else if (featureArray[count].attribute) {
                attributes = featureArray[count].attribute;
            } else {
                attributes = featureArray[count].attributes;
            }
            infoIndex = featureArray[count].layerIndex;
            if (featureArray.length > 1 && (!isFeatureListClicked)) {

                if (featureArray.length > 1 && count !== featureArray.length - 1) {
                    domClass.add(query(".esriCTdivInfoRightArrow")[0], "esriCTShowInfoRightArrow");
                    domAttr.set(query(".esriCTdivInfoFeatureCount")[0], "innerHTML", count);
                } else {
                    domClass.remove(query(".esriCTdivInfoRightArrow")[0], "esriCTShowInfoRightArrow");
                    domAttr.set(query(".esriCTdivInfoFeatureCount")[0], "innerHTML", "");
                }
                if (count > 0 && count < featureArray.length) {
                    domClass.add(query(".esriCTdivInfoLeftArrow")[0], "esriCTShowInfoLeftArrow");
                    domAttr.set(query(".esriCTdivInfoFeatureCount")[0], "innerHTML", count + 1);
                } else {
                    domClass.remove(query(".esriCTdivInfoLeftArrow")[0], "esriCTShowInfoLeftArrow");
                    domAttr.set(query(".esriCTdivInfoFeatureCount")[0], "innerHTML", count + 1);
                }
            } else {
                domClass.remove(query(".esriCTdivInfoRightArrow")[0], "esriCTShowInfoRightArrow");
                domClass.remove(query(".esriCTdivInfoLeftArrow")[0], "esriCTShowInfoLeftArrow");
                domAttr.set(query(".esriCTdivInfoFeatureCount")[0], "innerHTML", "");
                domAttr.set(query(".esriCTdivInfoTotalFeatureCount")[0], "innerHTML", "");
            }
            topic.publish("hideLoadingIndicatorHandler");
            dojo.featureID = attributes.ObjectID;

            layerSettings = dojo.configData.Workflows[infoIndex];
            dojo.layerID = layerSettings.SearchSettings[0].QueryLayerId;
            infoPopupFieldsCollection = layerSettings.InfowindowSettings[infoIndex].InfoWindowData;
            infoPopupHeight = dojo.configData.InfoPopupHeight;
            infoPopupWidth = dojo.configData.InfoPopupWidth;
            divInfoDetailsTab = domConstruct.create("div", { "class": "esriCTInfoDetailsTab" }, null);
            this.divInfoDetailsContainer = domConstruct.create("div", { "class": "divInfoDetailsContainer" }, divInfoDetailsTab);
            for (key = 0; key < infoPopupFieldsCollection.length; key++) {
                divInfoRow = domConstruct.create("div", { "className": "esriCTDisplayRow" }, this.divInfoDetailsContainer);
                // Create the row's label
                this.divInfoDisplayField = domConstruct.create("div", { "className": "esriCTDisplayField", "innerHTML": infoPopupFieldsCollection[key].DisplayText }, divInfoRow);
                this.divInfoFieldValue = domConstruct.create("div", { "className": "esriCTValueField" }, divInfoRow);
                for (i in attributes) {
                    if (attributes.hasOwnProperty(i)) {
                        if (!attributes[i]) {
                            attributes[i] = sharedNls.showNullValue;
                        }
                    }
                }
                try {
                    fieldNames = string.substitute(infoPopupFieldsCollection[key].FieldName, attributes);
                } catch (ex) {
                    fieldNames = sharedNls.showNullValue;
                }
                if (fieldNames.match("http:") || fieldNames.match("https:")) {
                    link = fieldNames;
                    divLink = domConstruct.create("div", { "class": "esriCTLink", innerHTML: sharedNls.titles.moreInfo }, this.divInfoFieldValue);
                    on(divLink, "click", lang.hitch(this, this._makeWindowOpenHandler(link)));
                } else {
                    this.divInfoFieldValue.innerHTML = fieldNames;
                }

            }
            for (j in attributes) {
                if (attributes.hasOwnProperty(j)) {
                    if (!attributes[j]) {
                        attributes[j] = sharedNls.showNullValue;
                    }
                }
            }
            try {
                infoTitle = string.substitute(layerSettings.InfowindowSettings[infoIndex].InfoWindowHeaderField, attributes);
            } catch (e) {
                infoTitle = sharedNls.showNullValue;
            }
            dojo.selectedMapPoint = mapPoint;
            if (!isInfoArrowClicked) {
                domClass.remove(query(".esriCTdivInfoRightArrow")[0], "disableArrow");
                domClass.remove(query(".esriCTdivInfoLeftArrow")[0], "disableArrow");
                this._centralizeInfowindowOnMap(infoTitle, divInfoDetailsTab, infoPopupWidth, infoPopupHeight);
            } else {
                screenPoint = this.map.toScreen(dojo.selectedMapPoint);
                screenPoint.y = this.map.height - screenPoint.y;
                domClass.remove(query(".esriCTdivInfoRightArrow")[0], "disableArrow");
                domClass.remove(query(".esriCTdivInfoLeftArrow")[0], "disableArrow");
                topic.publish("hideProgressIndicator");
                topic.publish("setInfoWindowOnMap", infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight);
            }
        },
        _centralizeInfowindowOnMap: function (infoTitle, divInfoDetailsTab, infoPopupWidth, infoPopupHeight) {
            var extentChanged, screenPoint;
            extentChanged = this.map.setExtent(this._calculateCustomMapExtent(dojo.selectedMapPoint));
            extentChanged.then(lang.hitch(this, function () {
                topic.publish("hideProgressIndicator");
                screenPoint = this.map.toScreen(dojo.selectedMapPoint);
                screenPoint.y = this.map.height - screenPoint.y;
                topic.publish("setInfoWindowOnMap", infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight);
            }));

        },
        /**
        * calculate extent of map
        * @memberOf widgets/locator/locator
        */
        _calculateCustomMapExtent: function (mapPoint) {
            var width, infoWidth, height, diff, ratioHeight, ratioWidth, totalYPoint, xmin,
                ymin, xmax, ymax;
            width = this.map.extent.getWidth();
            infoWidth = (this.map.width / 2) + dojo.configData.InfoPopupWidth / 2 + 400;
            height = this.map.extent.getHeight();
            if (infoWidth > this.map.width) {
                diff = infoWidth - this.map.width;
            } else {
                diff = 0;
            }
            ratioHeight = height / this.map.height;
            ratioWidth = width / this.map.width;
            totalYPoint = dojo.configData.InfoPopupHeight + 30 + 61;
            xmin = mapPoint.x - (width / 2);
            if (dojo.window.getBox().w >= 680) {
                ymin = mapPoint.y - height + (ratioHeight * totalYPoint);
                xmax = xmin + width + diff * ratioWidth;
            } else {
                ymin = mapPoint.y - (height / 2);
                xmax = xmin + width;
            }
            ymax = ymin + height;
            return new esri.geometry.Extent(xmin, ymin, xmax, ymax, this.map.spatialReference);
        }
    });
});