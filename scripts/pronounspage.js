// fetch user choccymilk from pronoun.page
fetch("https://en.pronouns.page/api/profile/get/choccymilk?version=2&props=pronouns,flags")
    // format to data.profiles.en.pronouns
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
