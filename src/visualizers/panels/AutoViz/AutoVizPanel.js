/*globals define, _, WebGMEGlobal*/
/*jshint browser: true*/
/**
 * Generated by VisualizerGenerator 0.1.0 from webgme on Wed Dec 23 2015 05:20:24 GMT-0600 (CST).
 */

define([
    'js/logger',
    'js/Constants',
    'js/RegistryKeys',
    'js/PanelBase/PanelBase',
    'text!/api/visualizers'
], function (
    Logger,
    CONSTANTS,
    REGISTRY_KEYS,
    PanelBase,
    VisualizersJSON
) {
    'use strict';

    var VisualizerIds,
        AutoVizPanel;

    VisualizersJSON = JSON.parse(VisualizersJSON)
        .filter(viz => viz.panel.indexOf('/AutoVizPanel') === -1);
    VisualizerIds = VisualizersJSON.map(viz => viz.id);

    // This visualizer simply checks the validVisualizers in the given node
    // and loads the appropriate visualizer.
    //
    // It is very similar to the "Visualizer" in the core WebGME library
    // except it is completely UI-less
    AutoVizPanel = function (layoutManager, params) {
        this._layoutManager = layoutManager;
        this._params = params;
        // Add setting for embedded behavior
        this._params.embedded = true;

        this._activePanel = null;
        this._activePanelId = null;
        this.currentNode = null;
        this._panels = {};

        this._territoryId = null;
        this._client = params.client;
        PanelBase.call(this, params);

        //initialize event handlers
        this._initialize();

        this.logger.debug('ctor finished');
    };

    AutoVizPanel.prototype._initialize = function() {
        WebGMEGlobal.State.on('change:' + CONSTANTS.STATE_ACTIVE_OBJECT,
            (model, id) => this.selectedObjectChanged(id));

        this._defaultPanelIndex = 0;
        for (var i = VisualizersJSON.length; i--;) {
            if (VisualizersJSON[i].default) {
                this._defaultPanelIndex = i;
            }
        }
    };

    AutoVizPanel.prototype.TERRITORY_RULE = {children: 0};
    AutoVizPanel.prototype.selectedObjectChanged = function(nodeId) {
        if (this._territoryId) {
            this._client.removeUI(this._territoryId);
        }

        if (typeof nodeId === 'string') {
            this._territoryId = this._client.addUI(this, events => {
                this._eventCallback(events);
            });
            this.logger.debug(`AutoViz current territory id is ${this._territoryId}`);

            this._selfPatterns = {};
            this._selfPatterns[nodeId] = this.TERRITORY_RULE;
            this._client.updateTerritory(this._territoryId, this._selfPatterns);
        }
    };

    AutoVizPanel.prototype._eventCallback = function(events) {
        var event = events.find(e => e.etype === CONSTANTS.TERRITORY_EVENT_LOAD),
            currentId = event ? event.eid : null,
            newNode;

        if (event) {
            newNode = this._client.getNode(currentId);
            if (!this.currentNode || this.currentNode !== newNode) {
                this.currentNode = this._client.getNode(currentId);
                this.update();
            }
        }
    };

    // Update the active panel
    AutoVizPanel.prototype.update = function() {
        var panelId,
            panelIndex;

        panelId = (this.currentNode.getRegistry(REGISTRY_KEYS.VALID_VISUALIZERS) || '')
            .split(' ')
            .shift();

        // If the panel id does not exist or is undefined, set it to the defaultId
        panelIndex = VisualizerIds.indexOf(panelId);
        if (panelIndex === -1) {
            panelIndex = this._defaultPanelIndex;
        }

        this.setPanel(VisualizersJSON[panelIndex], () => {
            if (this._activePanel.control &&
                this._activePanel.control.selectedObjectChanged) {
                this._activePanel.control.selectedObjectChanged(this.currentNode.getId());
            }
        });
    };

    AutoVizPanel.prototype.setPanel = function(panelDesc, cb) {
        var panel,
            self = this,
            containerSize;

        if (this._activePanelId === panelDesc.id) {
            return;
        }

        // Load the panel
        this.getPanel(panelDesc.panel, function(panel) {
            if (self._activePanel) {
                self._activePanel.destroy();
                self._activePanel.$pEl.remove();
            }
            self._layoutManager.addPanel('activePanel', panel, 'center');
            self._activePanel = panel;
            cb();
        });

        this._activePanelId = panelDesc.id;
    };

    AutoVizPanel.prototype.getPanel = function(panelPath, callback) {
        var self = this;

        if (this._panels[panelPath]) {
            callback(this._panels[panelPath]);
        } else {
            require([panelPath], function (PanelClass) {
                var nodeId = self.currentNode.getId(),
                    panel = new PanelClass(self._layoutManager, self._params);

                callback(panel);
            },
            function(err) {
                self.logger.debug('Failed to download "' + err.requireModules[0] + '"');
            });

        }
    };

    AutoVizPanel.prototype._forwardFn = function(fn, args) {
        if (this._activePanel) {
            return this._activePanel[fn].apply(this._activePanel, args);
        }
    };

    _.extend(AutoVizPanel.prototype, PanelBase.prototype);

    // Pass through functions
    AutoVizPanel.prototype.setSize = function() {
        return this._forwardFn.call(this, 'setSize', arguments);
    };

    AutoVizPanel.prototype.destroy = function() {
        return this._forwardFn.call(this, 'destroy', arguments);
    };

    AutoVizPanel.prototype.clear = function() {
        return this._forwardFn.call(this, 'clear', arguments);
    };

    AutoVizPanel.prototype.setReadOnly = function() {
        return this._forwardFn.call(this, 'setReadOnly', arguments);
    };

    AutoVizPanel.prototype.isReadOnly = function() {
        return this._forwardFn.call(this, 'isReadOnly', arguments);
    };

    AutoVizPanel.prototype.onReadOnlyChanged = function() {
        return this._forwardFn.call(this, 'onReadOnlyChanged', arguments);
    };

    AutoVizPanel.prototype.afterAppend = function() {
        return this._forwardFn.call(this, 'afterAppend', arguments);
    };

    return AutoVizPanel;
});