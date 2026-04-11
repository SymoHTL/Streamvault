using StreamVault.Infrastructure.Scanner;

namespace StreamVault.Api.Tests;

public class NamingConventionParserTests
{
    [Theory]
    [InlineData(
        "media/tv/The Boys/Season 1/The.Boys.2019.S01E01.Aller.Anfang.ist.schwer.GERMAN.DUBBED.DL.1080p.BluRay.x264-TSCC.mkv",
        "media/tv/",
        "The Boys", 1, 1, "Aller Anfang ist schwer")]
    [InlineData(
        "media/tv/The Boys/Season 1/The.Boys.2019.S01E02.Cherry.GERMAN.DUBBED.DL.1080p.BluRay.x264-TSCC.mkv",
        "media/tv/",
        "The Boys", 1, 2, "Cherry")]
    [InlineData(
        "media/tv/The Boys/Season 4/The.Boys.2024.S04E01.German.DL.EAC3.1080p.AMZN.WEB.H264.REPACK-ZeroTwo.mkv",
        "media/tv/",
        "The Boys", 4, 1, null)] // No episode title — just quality tags
    [InlineData(
        "media/tv/Breaking Bad/Season 4/Breaking.Bad.S04E01.Das.Teppichmesser.German.DL.AC3.5.1.1080p.Bluray.x264-iND.mkv",
        "media/tv/",
        "Breaking Bad", 4, 1, "Das Teppichmesser")]
    [InlineData(
        "media/tv/Breaking Bad/Season 5/Breaking.Bad.S05E01.Lebe.frei.oder.stirb.German.DL.1080p.BluRay.x264-iNTENTiON.mkv",
        "media/tv/",
        "Breaking Bad", 5, 1, "Lebe frei oder stirb")]
    [InlineData(
        "media/tv/Breaking Bad/Season 1/Breaking.Bad_2008.S01E01.Der.Einstieg.mkv",
        "media/tv/",
        "Breaking Bad", 1, 1, "Der Einstieg")]
    public void ParseTvShowPath_ExtractsCorrectEpisodeTitle(
        string s3Key, string prefix,
        string expectedShowTitle, int expectedSeason, int expectedEpisode, string? expectedEpTitle)
    {
        var result = NamingConventionParser.ParseTvShowPath(s3Key, prefix);

        Assert.NotNull(result);
        Assert.Equal(expectedSeason, result.SeasonNumber);
        Assert.Equal(expectedEpisode, result.EpisodeNumber);
        Assert.Equal(expectedEpTitle, result.EpisodeTitle);
    }
}
