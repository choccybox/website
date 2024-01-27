let currentProgress = 0;
let currentDuration = 0;

function fetchAndDisplayTime() {
    fetch('/player')
        .then(response => response.json())
        .then(data => {
            if (data.isPlaying == true) {
                if (data.albumArt === null) {
                    const name = data.name;
                    const artist = data.artist;

                    // Use Promise.all to wait for both fetch operations to complete
                    Promise.all([
                        fetch(`https://api.choccymilk.uk/sound-search/${encodeURIComponent(name)}/${encodeURIComponent(artist)}`)
                            .then(response => response.json()),
                        new Promise(resolve => {
                            // Resolve immediately if albumArt is present
                            if (data.albumArt) {
                                resolve({ art: data.albumArt, url: data.url });
                            } else {
                                resolve();
                            }
                        })
                    ])
                        .then(results => {
                            const result = results[0];
                            console.log(`name: ${result[0].title} by ${result[0].artist}\nurl: ${result[0].url}\nart: ${result[0].art}`);
                            document.getElementById("player_image").src = result[0].art;
                            document.getElementById("player_link").href = result[0].url;

                            // Update the rest of the elements
                            document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
                            document.getElementById("player_link").href = data.url;

                            currentProgress = data.progress;
                            currentDuration = data.duration;
                        })
                        .catch(error => {
                            console.error('Error fetching data:', error);
                        });
                } else {
                    console.log(`name: ${data.title} by ${data.artist}\nurl: ${data.url}\nart: ${data.art}`);
                    document.getElementById("player_image").src = data.albumArt;

                    // Update the rest of the elements
                    document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
                    document.getElementById("player_link").href = data.url;

                    currentProgress = data.progress;
                    currentDuration = data.duration;
                }
            } else {
                document.getElementById("player_image").src = data.albumArt;
                document.getElementById("player_title").innerHTML = "[LAST PLAYED] " + data.name + " • " + data.artist;
                document.getElementById("player_link").href = data.url;

                // Reset progress when playback stops
                currentProgress = 0;
            }
        });
}

function updateFakeProgressBar() {
    // Calculate the progress percentage
    const progressPercentage = (currentProgress / currentDuration) * 100;

    // Update the progress bar
    document.getElementById("player_progress").style.width = progressPercentage + "%";
    // each second, add however much the progress bar has progressed
    currentProgress += 1000;

    // if 100 is reached, call fetchAndDisplayTime() to get the new song
    if (currentProgress >= currentDuration) {
        fetchAndDisplayTime();
    }
}

// Fetch and display time immediately and then every 10 seconds
fetchAndDisplayTime();
setInterval(fetchAndDisplayTime, 10000);

// Update fake progress every second
setInterval(updateFakeProgressBar, 1000);
