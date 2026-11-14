using Microsoft.Data.Sqlite;
using Path = System.IO.Path;

namespace Scalable.Api;

public sealed class PinterestStore
{
    private readonly string connectionString;
    public PinterestStore(string path)
    {
        var fullPath = Path.GetFullPath(path);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        connectionString = new SqliteConnectionStringBuilder { DataSource = fullPath }.ToString();
        using var db = Open();
        using var command = db.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS connections (owner TEXT PRIMARY KEY, secret TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS oauth_states (hash TEXT PRIMARY KEY, owner TEXT NOT NULL, browser TEXT NOT NULL, expires INTEGER NOT NULL);
            """;
        command.ExecuteNonQuery();
    }
    private SqliteConnection Open() { var db = new SqliteConnection(connectionString); db.Open(); return db; }
    public string? Read(string owner)
    {
        using var db = Open(); using var command = db.CreateCommand();
        command.CommandText = "SELECT secret FROM connections WHERE owner=$owner";
        command.Parameters.AddWithValue("$owner", owner);
        return command.ExecuteScalar() as string;
    }
    public void Save(string owner, string protectedSecret)
    {
        using var db = Open(); using var command = db.CreateCommand();
        command.CommandText = "INSERT INTO connections(owner,secret) VALUES($owner,$secret) ON CONFLICT(owner) DO UPDATE SET secret=$secret";
        command.Parameters.AddWithValue("$owner", owner); command.Parameters.AddWithValue("$secret", protectedSecret);
        command.ExecuteNonQuery();
    }
    public void Delete(string owner)
    {
        using var db = Open(); using var transaction = db.BeginTransaction(); using var command = db.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "DELETE FROM connections WHERE owner=$owner; DELETE FROM oauth_states WHERE owner=$owner";
        command.Parameters.AddWithValue("$owner", owner); command.ExecuteNonQuery(); transaction.Commit();
    }
    public void Begin(string hash, string owner, string browser, long expires, long now)
    {
        using var db = Open(); using var transaction = db.BeginTransaction(); using var command = db.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "DELETE FROM oauth_states WHERE owner=$owner OR expires<=$now; INSERT INTO oauth_states(hash,owner,browser,expires) VALUES($hash,$owner,$browser,$expires)";
        command.Parameters.AddWithValue("$owner", owner); command.Parameters.AddWithValue("$now", now);
        command.Parameters.AddWithValue("$hash", hash); command.Parameters.AddWithValue("$browser", browser); command.Parameters.AddWithValue("$expires", expires);
        command.ExecuteNonQuery(); transaction.Commit();
    }
    public string? Consume(string hash, string browser, long now)
    {
        using var db = Open(); using var command = db.CreateCommand();
        command.CommandText = "DELETE FROM oauth_states WHERE hash=$hash AND browser=$browser AND expires>$now RETURNING owner";
        command.Parameters.AddWithValue("$hash", hash); command.Parameters.AddWithValue("$browser", browser); command.Parameters.AddWithValue("$now", now);
        return command.ExecuteScalar() as string;
    }
}
