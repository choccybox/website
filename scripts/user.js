//fetch /user endpoint
fetch("/user")
    .then(response => response.json())
    .then(data => {
        var socialHolder = document.getElementById("main_bottom");

        // create social buttons
        for (var i = 0; i < data.connections.length; i++) {
            var socialButton = document.createElement("a");
            socialButton.setAttribute("href", data.connections[i].url);
            socialButton.setAttribute("target", "_blank");
            socialButton.classList.add("noselect");
            var iconPath = `../styles/icons/${data.connections[i].type}.svg`;
            socialButton.innerHTML = `<div class="social_button"><div class="icon_holder"><img class="icon" src="${iconPath}" alt="${data.connections[i].type}"></div></div>`;
            socialHolder.appendChild(socialButton);
        }

        for (var i = 1; i <= 5; i++) {
            var info = document.createElement("a");
            info.id = "lastfminfo" + i;
            info.style.display = "none";
            
            var infoDiv = document.createElement("div");
            infoDiv.id = "social_button";
            infoDiv.classList.add("social_button");

            var infoIconHolder = document.createElement("div");
            infoIconHolder.className = "icon_holder";

            var infoIcon = document.createElement("img");
            infoIcon.classList.add("icon");
            infoIcon.id = "lastfminfo" + i + "_icon";
            infoIcon.src = "../styles/icons/info" + i + ".svg";
            infoIcon.alt = "lastfminfo" + i;

            infoIconHolder.appendChild(infoIcon);
            infoDiv.appendChild(infoIconHolder);
            info.appendChild(infoDiv);
            socialHolder.appendChild(info);
        }

        var moreAboutA = document.createElement("a");
        moreAboutA.id = "moreabout";
        // create div for more about
        var moreAboutDiv = document.createElement("div");
        moreAboutDiv.id = "more_about";
        moreAboutDiv.classList.add("social_button");
        // create icon_holder
        var iconHolder = document.createElement("div");
        iconHolder.className = "icon_holder";
        // create icon
        var icon = document.createElement("img");
        icon.classList.add("icon");
        icon.id = "more_icon";
        icon.src = "../styles/icons/more.svg";
        icon.alt = "more";
        // append elements
        iconHolder.appendChild(icon);
        moreAboutDiv.appendChild(iconHolder);
        moreAboutA.appendChild(moreAboutDiv);
        socialHolder.appendChild(moreAboutA);


        // Check if user is on a mobile device
        var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        // Check if user is using cellular data
        var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        var isCellular = false;

        if (connection && connection.type === 'cellular') {
            isCellular = true;
        }

        console.log("📱 is mobile avatar?", isMobile);
        console.log("📶 is cellular avatar?", isCellular);

        // If the user is on mobile and using cellular data, set the avatar to the low-quality version
        if (isMobile && isCellular) {
            document.getElementById("avatar_image").src = data.avatar.low;
        } else {
            document.getElementById("avatar_image").src = data.avatar.high;
        }

        document.getElementById("avatar_link").href = data.userUrl;
        document.getElementById("avatar_credit_text").innerHTML = `made by <a id="avatar_credit_link" href='${data.avatarCredit}' target='_blank'>${data.avatarCreditText}</a>`;
    });

// fetch user choccymilk from pronoun.page
fetch("https://en.pronouns.page/api/profile/get/choccymilk?version=2&props=pronouns,flags")
    .then(response => response.json())
    .then(data => {
        var pronouns = [];
        for (var i = 0; i < data.profiles.en.pronouns.length; i++) {
            pronouns.push(data.profiles.en.pronouns[i].value.toLowerCase());
        }
        var flags = [];
        for (var i = 0; i < data.profiles.en.flags.length; i++) {
            flags.push(data.profiles.en.flags[i].toLowerCase());
        }

        // Join the pronouns array into a string
        var pronounsString = pronouns.join(', ');

        // Form the flag URLs
        var flagsImg = flags.map(flag => `
        <a id="flag_name" href='https://www.urbandictionary.com/define.php?term=${flag}' target='_blank'>${flag}</a>
        <img id="flag_icon" src="https://en.pronouns.page/flags/${flag.charAt(0).toUpperCase() + flag.slice(1)}.png"></img>`);

        // Set the innerHTML of the "pronouns" element
        document.getElementById("pronouns").innerHTML = pronounsString + " pronouns";
        document.getElementById("flag").innerHTML = `${flagsImg}`;
    });
