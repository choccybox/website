let isDataFetched = false;

if (!isDataFetched) {
    fetch('/stats')
        .then(response => response.json())
        .then(data => {
        const topAlbumsHolder = document.getElementById('lastfm_topalbums_holder');
        const topArtistHolder = document.getElementById('lastfm_topartist_holder');
        const topTracksHolder = document.getElementById('lastfm_toptracks_holder');

        // Reusable function to generate HTML elements for each item
        const generateItemHTML = (item, className) => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add(className);
            itemDiv.setAttribute('data-rank', item.rank);

            // if data-rank is above 4, hide all elements with data-rank above 4
            if (item.rank > 4) {
                itemDiv.style.display = 'none';
            }

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

        // get the total plays from userInfo and display it into id lastfminfo1
        const infoElements = [];
        for (let i = 0; i < 5; i++) {
            infoElements.push({ id: `lastfminfo${i+1}`, key: Object.keys(data.lastfm.userInfo)[i] });
        }

        infoElements.forEach(element => {
            const value = data.lastfm.userInfo[element.key];
            const label = element.key.replace(/^total_/, '');
            document.getElementById(element.id).innerHTML = `<div id="social_button" class="social_button" style="display: block;"><div class="icon_holder"><p style="text-align:center">${value} ${label}</p></div></div>`;
        });

        isDataFetched = true;
    })
    .catch(error => {
        console.error('Error during data fetch:', error);
    });
} else {
    console.log('Data already fetched');
}
