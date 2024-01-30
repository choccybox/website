let currentProgress = 0;
let currentDuration = 0;
let isPlaying = false;

function fetchAndDisplayTime() {
    fetch('/player')
        .then(response => response.json())
        .then(data => {
            isPlaying = data.isPlaying;

            if (isPlaying) {
                console.log(`name: ${data.name} • ${data.artist}\nurl: ${data.url}\nart: ${data.art}`);

                if (data.art === null) {
                    document.getElementById("player_image").src = "./styles/spong.png";
                } else {
                    document.getElementById("player_image").src = data.art;
                }

                if (data.url === null) {

                    document.getElementById("player_link").removeAttribute("target");
                } else {
                    document.getElementById("player_link").href = data.url;
                }

                // Update the rest of the elements
                document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;

                currentProgress = data.progress || 0;
                currentDuration = data.duration || 0;

                // Update the progress bar
                const progressPercentage = (currentProgress / currentDuration) * 100;
                document.getElementById("player_progress").style.width = progressPercentage + "%";

                if (currentProgress >= currentDuration) {
                    // Handle song completion
                    fetchAndDisplayTime();
                }
            } else {
                // Handle playback stop
                document.getElementById("player_image").src = data.art;
                document.getElementById("player_title").innerHTML = "[LAST PLAYED] " + data.name + " • " + data.artist;
                document.getElementById("player_link").href = data.url;

                currentProgress = 0;

                // Set the width of the progress bar to 0
                document.getElementById("player_progress").style.width = "0%";
            }
        });
}

// Fetch and display time immediately and then every 10 seconds
fetchAndDisplayTime();
setInterval(fetchAndDisplayTime, 10000);

// Update fake progress only when playing
function updateFakeProgressBar() {
    if (isPlaying && currentProgress < currentDuration) {
        // each second, add however much the progress bar has progressed
        currentProgress += 1000;
        console.log((currentProgress / currentDuration) * 100);

        // set width of progress bar
        const progressPercentage = (currentProgress / currentDuration) * 100;
        document.getElementById("player_progress").style.width = progressPercentage + "%";

        if (currentProgress >= currentDuration) {
            // Handle song completion
            fetchAndDisplayTime();
        }
    } else {
        // Handle playback stop
        currentProgress = 0;
    }
}

// Update fake progress every second
setInterval(updateFakeProgressBar, 1000);
