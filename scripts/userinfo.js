//fetch output of express server
fetch ("/userinfo")
    .then(response => response.json())
    .then(data => {
        var socialHolder = document.getElementById("socials");

        // ignore domain type 
        for (var i = 0; i < data.connections.length; i++) {
            if (data.connections[i].type == "domain") {
                data.connections.splice(i, 1);
            }
        }

        socialHolder.innerHTML = "";
        // create social buttons
        for (var i = 0; i < data.connections.length; i++) {
            var socialButton = document.createElement("a");
            socialButton.setAttribute("href", data.connections[i].url);
            socialButton.setAttribute("target", "_blank");
            socialButton.classList.add("noselect");
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

        // remove https://twitter.com from avatar credit
        const url = new URL(data.avatarCredit);
        const pathSegments = url.pathname.split('/');
        const lastSegment = pathSegments[pathSegments.length - 1];
        
        const avatarCreditFormatted = lastSegment;
        

        document.getElementById("avatar_image").src = data.avatar;
        document.getElementById("avatar_link").href = data.userUrl;
        document.getElementById("avatar_credit_text").innerHTML = `made by <a id="avatar_credit_link" href='${data.avatarCredit}' target='_blank'>${avatarCreditFormatted}</a>`;



/*         document.getElementById("main_right").style.display = "flex";
        document.getElementById("avatar").style.display = "block";
        document.getElementById("player").style.display = "block"; */
    });