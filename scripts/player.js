let isPlaying = false;

function player() {
    fetch('/player')
        .then(response => response.json())
        .then(data => {
            isPlaying = data.isPlaying;
            var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            var isCellular = false;
            if (connection && connection.type === 'cellular') {
                isCellular = true;
            }
            console.log("📱 is mobile player?", isMobile);
            console.log("📶 is cellular player?", isCellular);

            let playerImage = document.getElementById("player_image");
            let newSrc = null;
            if (isMobile && isCellular) {
                newSrc = data.image.low;
            } else if (data.art === null) {
                newSrc = "../styles/spong.webp";
                document.getElementById("player_timeline").style.display = "none";
            } else {
                newSrc = data.image.high;
            }
            if (playerImage.src !== newSrc) {
                const tempImg = new window.Image();
                tempImg.onload = function() {
                    playerImage.src = newSrc;
                };
                tempImg.onerror = function() {
                    playerImage.src = "../styles/spong.webp";
                };
                tempImg.src = newSrc;
            }
            document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
        });
}

player();
setInterval(player, 30000);

