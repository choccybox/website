let isDataFetched = false;

if (!isDataFetched) {
    const statsRequest = window.statsData
        ? Promise.resolve(window.statsData)
        : fetch('/stats').then(response => {
            if (!response.ok) {
                throw new Error(`Stats request failed with status ${response.status}`);
            }
            return response.json();
        });

    statsRequest.then(data => {
        const topAlbumsHolder = document.getElementById('lastfm1scrollable');
        const topArtistHolder = document.getElementById('lastfm2scrollable');
        const topTracksHolder = document.getElementById('lastfm3scrollable');

        // get all lastfm_title classes and add display:block
        const lastfmTitles = document.querySelectorAll('.lastfm_title');
        lastfmTitles.forEach(title => {
            title.style.display = 'block';
        });

        // Reusable function to generate HTML elements for each item
        const generateItemHTML = (item, className) => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add(...className.split(' '));
            itemDiv.setAttribute('data-rank', item.rank);
            itemDiv.classList.add('skeleton_loader_small_lastfm');

            const itemImage = document.createElement('img');
            itemImage.classList.add(`${className.split(' ')[0]}_image`);
            // Preload image before setting src to avoid NS_BINDING_ABORTED
            const tempImg = new window.Image();
            tempImg.onload = function() {
                itemImage.src = item.imageHigh;
            };
            tempImg.onerror = function() {
                itemImage.src = "styles/blank.png";
            };
            tempImg.src = item.imageHigh;

            const itemNameDiv = document.createElement('div');
            itemNameDiv.style.height = '100%';
            itemNameDiv.style.marginBottom = 'calc(-100% + 18px)';

            const itemName = document.createElement('p');
            itemName.innerHTML = item.name + '<br>' + '<p class="lastfmTextSub" style="font-size:0.75rem;">' + item.playcount + ' plays' + '</p>';
            itemName.style.fontSize = '1rem';
            itemName.classList.add(`lastfmTextTop`);
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
        const topAlbumsHTML = data.topAlbums.map(track => generateItemHTML(track, 'lastfm_track'));
        topAlbumsHolder.append(...topAlbumsHTML);

        // Loop through data.lastfm.topArtists
        const topArtistsHTML = data.topArtists.map(artist => generateItemHTML(artist, 'lastfm_track'));
        topArtistHolder.append(...topArtistsHTML);

        // Loop through data.lastfm.topSongs
        const topSongsHTML = data.topTracks.map(song => generateItemHTML(song, 'lastfm_track'));
        topTracksHolder.append(...topSongsHTML);

        // get the total plays from userInfo and display it into id lastfminfo1
        const infoElements = [];
        for (let i = 0; i < 5; i++) {
            infoElements.push({ id: `lastfminfo${i+1}`, key: Object.keys(data.userInfo)[i] });
        }

        infoElements.forEach(element => {
            const value = data.userInfo[element.key];
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
