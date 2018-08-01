/*globals define, _, WebGMEGlobal*/
/*jshint browser: true*/

define([
    'js/logger',
    'js/Constants',
    'js/RegistryKeys',
    'js/PanelBase/PanelBase',
    'js/Utils/ComponentSettings',
    'text!/api/visualizers'
], function (
    Logger,
    CONSTANTS,
    REGISTRY_KEYS,
    PanelBase,
    ComponentSettings,
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
        var options = {};
        options[PanelBase.OPTIONS.LOGGER_INSTANCE_NAME] = 'AutoViz';
        PanelBase.call(this, options);

        this._layoutManager = layoutManager;
        this._params = params;
        // Add setting for embedded behavior
        this._params.embedded = true;

        this._activePanel = null;
        this._activePanelId = null;
        this._activeProject = null;
        this.currentNode = null;
        this._panels = {};

        this._territoryId = null;
        this._client = params.client;

        this.config = {
            preloadIds: [],
            visualizerOverrides: {}
        };
        ComponentSettings.resolveWithWebGMEGlobal(this.config, AutoVizPanel.getComponentId());
        this.preloadId = 0;

        //initialize event handlers
        this._initialize();
        this.preloadNext();

        this.logger.debug('ctor finished');
    };

    AutoVizPanel.getComponentId = function() {
        return 'AutoViz';
    };

    AutoVizPanel.prototype.preloadNext = function() {
        var panelId,
            panelIndex = -1;

        // Load the next visualizer id
        while (this.preloadId < this.config.preloadIds.length && panelIndex === -1) {
            panelId = this.config.preloadIds[this.preloadId++];
            panelIndex = VisualizerIds.indexOf(panelId);
        }

        if (panelIndex !== -1) {
            this.getPanel(VisualizersJSON[panelIndex].panel, this.preloadNext.bind(this));
        }
    };

    AutoVizPanel.prototype._initialize = function() {
        WebGMEGlobal.State.on('change:' + CONSTANTS.STATE_ACTIVE_OBJECT,
            (model, id) => {
                var currentProject = this._client.getActiveProjectName(),
                    refresh = this._activeProject !== currentProject ||
                        !this.currentNode || this.currentNode.getId() !== id;

                if (refresh) {
                    if (this._activeProject !== currentProject) {
                        this.logger.debug(`Project changed: ${this._activeProject} -> ${currentProject}`);
                    }
                    this.logger.debug(`Loading node "${id}"`);
                    this.selectedObjectChanged(id);
                    this._activeProject = currentProject;
                }
            });

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
                this.logger.debug(`Received ${events.length} events`);
                this._eventCallback(events);
            });
            this.logger.debug(`AutoViz current territory id is ${this._territoryId}`);

            this._selfPatterns = {};
            this._selfPatterns[nodeId] = this.TERRITORY_RULE;
            this.logger.debug(`updating territory: ${JSON.stringify(this._selfPatterns)}`);
            this._client.updateTerritory(this._territoryId, this._selfPatterns);
        }
    };

    AutoVizPanel.prototype._eventCallback = function(events) {
        var event = events.find(e => e.etype === CONSTANTS.TERRITORY_EVENT_LOAD),
            currentId = event ? event.eid : null,
            newNode;

        if (event) {
            this.logger.info(`received event for node "${currentId}"`);
            newNode = this._client.getNode(currentId);
            if (!this.currentNode || this.currentNode !== newNode) {
                this.currentNode = newNode;
                this.update();
            }
        }
    };

    // Update the active panel
    AutoVizPanel.prototype.update = function() {
        var panelId,
            panelIndex;

        panelId = this.getPanelId();

        // If the panel id does not exist or is undefined, set it to the defaultId
        panelIndex = VisualizerIds.indexOf(panelId);
        if (panelIndex === -1) {
            panelIndex = this._defaultPanelIndex;
        }

        this.logger.info(`setting active panel to ${panelId}`);
        this.setPanel(VisualizersJSON[panelIndex], () => {
            if (this._activePanel.control &&
                this._activePanel.control.selectedObjectChanged) {
                this.logger.info('invoking selectedObjectChanged on active panel');
                this._activePanel.control.selectedObjectChanged(this.currentNode.getId());
            }
        });
    };

    AutoVizPanel.prototype.getPanelId = function() {
        var base = this._client.getNode(this.currentNode.getMetaTypeId()),
            baseType = base && base.getAttribute('name');

        // If currentNode is the root node, use "" as the baseType
        if (this.currentNode.getId() === CONSTANTS.PROJECT_ROOT_ID) {
            baseType = '';
        }

        if (this.config.visualizerOverrides[baseType]) {
            return this.config.visualizerOverrides[baseType];
        }

        return (this.currentNode.getRegistry(REGISTRY_KEYS.VALID_VISUALIZERS) || '')
            .split(' ')
            .shift();
    };

    AutoVizPanel.prototype.setPanel = function(panelDesc, cb) {
        var self = this;

        if (panelDesc.id === this._activePanelId) {
            return cb();
        }

        // Load the panel
        this.getPanel(panelDesc.panel, function(PanelClass) {
            if (self._activePanel) {
                self._activePanel.destroy();
                self._activePanel.$pEl.remove();
            }
            var panel = new PanelClass(self._layoutManager, self._params);
            self._layoutManager.addPanel('activePanel', panel, 'center');
            self._activePanel = panel;
            // set read only
            self._activePanel.setReadOnly(self.isReadOnly());
            self._activePanelId = panelDesc.id;
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
                self._panels[panelPath] = PanelClass;
                callback(PanelClass);
            },
            function(err) {
                self.logger.error('Failed to download "' + err.requireModules[0] + '"');
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
        return this._forwardFn('setSize', arguments);
    };

    AutoVizPanel.prototype.destroy = function() {
        return this._forwardFn('destroy', arguments);
    };

    AutoVizPanel.prototype.clear = function() {
        return this._forwardFn('clear', arguments);
    };

    AutoVizPanel.prototype.afterAppend = function() {
        return this._forwardFn('afterAppend', arguments);
    };

    AutoVizPanel.prototype.setReadOnly = function() {
        PanelBase.prototype.setReadOnly.apply(this, arguments);
        return this._forwardFn('setReadOnly', arguments);
    };

    AutoVizPanel.prototype.isReadOnly = function() {
        return PanelBase.prototype.isReadOnly.apply(this, arguments);
    };

    AutoVizPanel.prototype.onReadOnlyChanged = function() {
        PanelBase.prototype.onReadOnlyChanged.apply(this, arguments);
        return this._forwardFn('onReadOnlyChanged', arguments);
    };

    return AutoVizPanel;
});
