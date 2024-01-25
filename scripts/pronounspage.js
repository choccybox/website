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
        console.log(`pronouns: ${pronouns}\nflags: ${flags}`);

        // Join the pronouns array into a string
        var pronounsString = pronouns.join(', ');

        // Set the innerHTML of the "pronouns" element
        document.getElementById("pronouns").innerHTML = pronounsString + " pronouns";
        document.getElementById("flag").innerHTML = `<a id="flag_name" href='https://www.urbandictionary.com/define.php?term=aroace' target='_blank'>${flags.join(', ')}</a> <img id='flag_icon' src='../styles/aroace.png'></img>`;
    });
