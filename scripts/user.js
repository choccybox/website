    //fetch /user endpoint
    fetch ("/user")
    .then(response => response.json())
    .then(data => {
        var socialHolder = document.getElementById("main_bottom");

        // ignore domain type 
        for (var i = 0; i < data.connections.length; i++) {
            if (data.connections[i].type == "domain") {
                data.connections.splice(i, 1);
            }
        }

        // create social buttons
        for (var i = 0; i < data.connections.length; i++) {
            var socialButton = document.createElement("a");
            socialButton.setAttribute("href", data.connections[i].url);
            socialButton.setAttribute("target", "_blank");
            socialButton.classList.add("noselect");
            socialButton.innerHTML = `<div class="social_button"><i class="fa-brands fa-${data.connections[i].type}"></i></div>`;
            socialHolder.appendChild(socialButton);
        }

        // remove https://website.com/ from url
        const url = new URL(data.avatarCredit);
        const pathSegments = url.pathname.split('/');
        const lastSegment = pathSegments[pathSegments.length - 1];
        
        const avatarCreditFormatted = lastSegment;
        

        // check if user is on cellular
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const isMobileConnection = connection && connection.effectiveType === 'cellular';
        console.log("🔎 is on cellular avatar?", isMobileConnection);

        if (isMobileConnection) {
            document.getElementById("avatar_image").src = data.avatar.low
        } else {
            document.getElementById("avatar_image").src = data.avatar.high
        }
        
        document.getElementById("avatar_link").href = data.userUrl;
        document.getElementById("avatar_credit_text").innerHTML = `made by <a id="avatar_credit_link" href='${data.avatarCredit}' target='_blank'>${avatarCreditFormatted}</a>`;
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
        for (var i = 0; i <data.profiles.en.flags.length; i++) {
            flags.push(data.profiles.en.flags[i].toLowerCase());
        }

        // Join the pronouns array into a string
        var pronounsString = pronouns.join(', ');

        // Form the flag URLs
        var flagsImg = flags.map(flag => `
        <a id="flag_name" href='https://www.urbandictionary.com/define.php?term=${flags}' target='_blank'>${flag}</a>
        <img id="flag_icon" src="https://en.pronouns.page/flags/${flag.charAt(0).toUpperCase() + flag.slice(1)}.png"></img>`);

        // Set the innerHTML of the "pronouns" element
        document.getElementById("pronouns").innerHTML = pronounsString + " pronouns";
        document.getElementById("flag").innerHTML = `${flagsImg}`;
    });