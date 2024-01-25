// Wait for every script and fetch to load
var waiter = (function () {
    var resourcesToLoad = 0;
    var loadedResources = 0;

    function waitForResources() {
        loadedResources++;
        if (loadedResources === resourcesToLoad) {
            onAllResourcesLoaded();
        }
    }

    function onAllResourcesLoaded() {
        // All resources (scripts and fetches) have loaded
        removePanelLoaderClass();
    }

    function removePanelLoaderClass() {
        // Use CSS to remove all elements with the class "panel_loader"
        var panelLoaders = document.querySelectorAll('.panel_loader');
        panelLoaders.forEach(function (element) {
            element.classList.remove('panel_loader');
        });
    }

    function handleScriptLoad(script) {
        // Increment the count of scripts to load
        resourcesToLoad++;
        script.onload = function () {
            waitForResources();
        };
    }

    // Handle scripts
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
        if (scripts[i].src) {
            handleScriptLoad(scripts[i]);
        } else {
            // Script without src attribute (inline script)
            resourcesToLoad++;
        }
    }

    // Handle fetches (you need to adapt this based on your fetch implementation)
    // Example: Assume you have an array of fetch promises called "fetchPromises"
    var fetchPromises = []; // Replace this with your actual fetch promises
    resourcesToLoad += fetchPromises.length;

    fetchPromises.forEach(function (fetchPromise) {
        fetchPromise.then(function () {
            waitForResources();
        });
    });

    // Check if no resources need to be loaded initially
    if (resourcesToLoad === 0) {
        onAllResourcesLoaded();
    }

    // Public API
    return {
        onready: function () {
            // override this if needed
        }
    };
})();
