//fetch output of express server
fetch ("/discorduser")
    .then(response => response.json())
    .then(data => {
        console.log(data);
        var socialHolder = document.getElementById("socials");

        // console all connections, filter out visibility = 0 and domain, dont ignore spotify, keep it in
        for (var i = 0; i < data.connections.length; i++) {
            if (data.connections[i].visibility == 0 && data.connections[i].type != "spotify" || data.connections[i].type === "domain") {
                data.connections.splice(i, 1);
                i--;
            }
        }

        // clear html
        socialHolder.innerHTML = "";
        // create social buttons
        for (var i = 0; i < data.connections.length; i++) {
            var socialButton = document.createElement("a");
            socialButton.setAttribute("href", data.connections[i].url);
            socialButton.setAttribute("target", "_blank");
            socialButton.innerHTML = `<div class="social_button"><i class="fa-brands fa-${data.connections[i].type}"></i></div>`;
            socialHolder.appendChild(socialButton);
        }

       // remove all panel_loader classes
        var loaders = document.getElementsByClassName("panel_loader");
        for (var i = 0; i < loaders.length; i++) {
            loaders[i].style.display = "none";
        }
        var split_loader = document.getElementsByClassName("panel_split_loader");
        for (var i = 0; i < split_loader.length; i++) {
            split_loader[i].style.display = "none";
        }
        
        var panels = document.getElementsByClassName("panel");
        for (var i = 0; i < panels.length; i++) {
            panels[i].style.display = "block";
        }
        var split = document.getElementsByClassName("panel_split");
        for (var i = 0; i < split.length; i++) {
            split[i].style.display = "block";
        }
        document.getElementById("avatar").src = data.avatar;

/*         document.getElementById("main_right").style.display = "flex";
        document.getElementById("avatar").style.display = "block";
        document.getElementById("player").style.display = "block"; */
    });