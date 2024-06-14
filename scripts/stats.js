let isDataFetched = false;

if (!isDataFetched) {
    fetch('/stats')
        .then(response => response.json())
        .then(data => {
        console.log(data.lastfm);
        const topAlbumsHolder = document.getElementById('lastfm_topalbums_holder');
        const topArtistHolder = document.getElementById('lastfm_topartist_holder');
        const topTracksHolder = document.getElementById('lastfm_toptracks_holder');
        const userInfoHolder = document.getElementById('lastfm_userinfo_holder');

        // Reusable function to generate HTML elements for each item
        const generateItemHTML = (item, className) => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add(className);

            const itemImage = document.createElement('img');
            itemImage.classList.add(`${className}_image`);
            itemImage.src = item.imageHigh;
            itemImage.style.filter = 'brightness(0.5)';

            const itemNameDiv = document.createElement('div');
            itemDiv.classList.add(className);
            itemNameDiv.style.height = '100%';
            itemNameDiv.style.marginBottom = 'calc(-100% + 18px)';

            const itemName = document.createElement('p');
            itemName.innerHTML = item.name + '<br>' + '<p style="font-size:0.75rem;">' + item.playcount + ' plays' + '</p>';
            itemName.style.fontSize = '1rem';
            itemName.style.overflow = 'hidden';
            itemName.style.textOverflow = 'ellipsis';
            itemName.style.wordBreak = 'break-word';
            itemName.style.textAlign = 'center';
            itemName.style.zIndex = '1';
            itemName.style.position = 'relative';
            itemName.style.top = '50%';
            itemName.style.transform = 'translateY(-50%)';

            itemNameDiv.appendChild(itemName);
            itemDiv.appendChild(itemNameDiv);
            itemDiv.appendChild(itemImage);

            return itemDiv;
        };

        // Loop through data.lastfm.recentTracks
        const topAlbumsHTML = data.lastfm.topAlbums.map(track => generateItemHTML(track, 'lastfm_track'));
        topAlbumsHolder.append(...topAlbumsHTML);

        // Loop through data.lastfm.topArtists
        const topArtistsHTML = data.lastfm.topArtists.map(artist => generateItemHTML(artist, 'lastfm_track'));
        topArtistHolder.append(...topArtistsHTML);

        // Loop through data.lastfm.topSongs
        const topSongsHTML = data.lastfm.topTracks.map(song => generateItemHTML(song, 'lastfm_track'));
        topTracksHolder.append(...topSongsHTML);

// Get all data from userInfo and log it to the console
const userInfo = data.lastfm.userInfo;
console.log(userInfo);

// Create a map to rewrite or change the data names
const dataNameMap = {
    total_plays: 'total plays',
    total_tracks: 'total tracks',
    total_albums: 'total albums',
    total_artists: 'total artists',
    // Add more mappings as needed
};

// Iterate over each entry in userInfo and create a separate div for each one
for (const [key, value] of Object.entries(userInfo)) {
    // Create a new div for each userInfo entry
    const userInfoDiv = document.createElement('div');
    userInfoDiv.classList.add('lastfm_track');

    const userInfoData = document.createElement('div');
    userInfoData.style.height = '100%';
    userInfoData.style.marginBottom = 'calc(-100% + 18px)';
    
    // Create a p element to display the key and value with the mapped name
    const userInfoText = document.createElement('p');
    const displayName = dataNameMap[key] || key; // Use mapped name or fallback to original key
    
    // Wrap the value in a span to apply a different font size
    userInfoText.innerHTML = `${displayName}:<br><span style="font-size: 0.75rem;">${value}</span>`;
    userInfoText.style.fontSize = '1rem';
    userInfoText.style.overflow = 'hidden';
    userInfoText.style.textOverflow = 'ellipsis';
    userInfoText.style.wordBreak = 'break-word';
    userInfoText.style.textAlign = 'center';
    userInfoText.style.zIndex = '1';
    userInfoText.style.position = 'relative';
    userInfoText.style.top = '50%';
    userInfoText.style.transform = 'translateY(-50%)';

    const userInfoImage = document.createElement('div');
    userInfoImage.classList.add(`lastfm_track_image`);
    
    // Append the p element to the newly created div
    userInfoData.appendChild(userInfoText);
    userInfoDiv.appendChild(userInfoData);
    userInfoDiv.appendChild(userInfoImage);
    
    // Append the div to the userInfoHolder element
    userInfoHolder.appendChild(userInfoDiv);
}

        const wakaLanguages = document.getElementById('waka_languages');
        const wakaProjects = document.getElementById('waka_projects');

        // Loop through data.wakatime.languages
        const wakaLanguagesHTML = data.waka.languages.map(language => {

            const languageMap = {
                'HTML': 'html5',
                'CSS': 'css3',
            };
            
            const languageNameIconDiv = document.createElement('div');
            languageNameIconDiv.classList.add('language-name-icon-div');

            const languageIcon = document.createElement('img');
            languageIcon.src = `https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/${languageMap[language.name] || language.name.toLowerCase()}/${languageMap[language.name] || language.name.toLowerCase()}-original.svg`;
            languageIcon.style.scale = '0.75';
            languageIcon.style.marginBottom = '5px';
            languageIcon.style.transform = 'rotate3d(1, 0, 0, 180deg)';

            const languageName = document.createElement('p');
            languageName.innerHTML = language.name;
            languageName.style.textAlign = 'center';
            languageName.style.transform = 'rotate3d(1, 0, 0, 180deg)';
            languageName.style.fontSize = '1.25rem';
            languageName.style.marginTop = '-10px';
            languageName.style.opacity = '0';
          
            const languageDiv = document.createElement('div');
            languageDiv.style.height = '280px';
            languageDiv.style.width = 250 / data.waka.languages.length + 'px';
            languageDiv.style.marginRight = '10px';

            // for last languages, remove margin right
            if (data.waka.languages.indexOf(language) === data.waka.languages.length - 1) {
                languageDiv.style.marginRight = '0';
                languageName.style.marginLeft = '-17px';

            } // or if first languageName, add margin left
            else if (data.waka.languages.indexOf(language) === 0) {
                languageName.style.marginLeft = '7px';
            } 

            const languageDivInner = document.createElement('div');
            languageDivInner.style.height = language.percent;
            languageDivInner.style.width = 250 / data.waka.languages.length + 'px';
            languageDivInner.style.backgroundColor = 'var(--timeline)';

            languageDiv.append(languageDivInner);
            
            languageNameIconDiv.append(languageIcon);
            languageNameIconDiv.append(languageName);
            languageDiv.append(languageNameIconDiv);

            return languageDiv;
        })

        wakaLanguages.append(...wakaLanguagesHTML);

        const wakaProjectsHTML = data.waka.projects.map(project => {

            const projectDiv = document.createElement('div');
            projectDiv.classList.add('lastfm_track');
            projectDiv.style.height = 'calc(50% - 18px)';

            const projectImage = document.createElement('div');
            projectImage.classList.add('lastfm_track_image');
            projectImage.style.height = '100%';
            projectImage.style.filter = 'brightness(0.5)';

            const projectNameDiv = document.createElement('div');
            projectNameDiv.style.height = '100%';
            projectNameDiv.style.marginBottom = 'calc(-100% + 18px)';

            const projectName = document.createElement('p');
            projectName.innerHTML = project.name + '<br>' + '<span style="font-size:0.75rem;">' + project.percent + '</span>';
            projectName.style.fontSize = '1rem';
            projectName.style.overflow = 'hidden';
            projectName.style.textOverflow = 'ellipsis';
            projectName.style.wordBreak = 'break-word';
            projectName.style.textAlign = 'center';
            projectName.style.zIndex = '1';
            projectName.style.position = 'relative';
            projectName.style.top = '50%';
            projectName.style.transform = 'translateY(-50%)';

            projectNameDiv.appendChild(projectName);
            projectDiv.appendChild(projectNameDiv);
            projectDiv.appendChild(projectImage);
            
            return projectDiv;
        })

        wakaProjects.append(...wakaProjectsHTML);

        isDataFetched = true;
    })
    .catch(error => {
        console.error('Error during data fetch:', error);
    });
} else {
    console.log('Data already fetched');
}
